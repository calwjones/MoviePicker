import { Router, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { authenticateUser, AuthRequest } from '../middleware/auth';
import { findOrCreateMovie } from '../services/tmdb';
import { prisma } from '../app';
import { mapWithConcurrency } from '../lib/concurrency';
import {
  assertProfileExists,
  createCookieJar,
  createSessionNumber,
  fetchRated,
  fetchWatchlist,
  withScrapeSlot,
  LetterboxdProfileNotFound,
  LetterboxdProfilePrivate,
  LetterboxdRateLimited,
  LetterboxdMarkupError,
  type FilmEntry,
  type RatedEntry,
} from '../services/letterboxdScraper';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

interface LetterboxdCsvRow {
  Date?: string;
  Name?: string;
  Year?: string;
  'Letterboxd URI'?: string;
  Rating?: string;
}

interface ImportEntry {
  title: string;
  year: number | null;
  watched: boolean;
  rating: number | null;
}

interface ImportResults {
  imported: number;
  skipped: number;
  failed: number;
  total: number;
  errors: string[];
}

type LibraryState = { onWatchlist: boolean; watched: boolean };
/** Writes one entry; resolves to the row's new library state, or null when skipped. */
type ApplyEntry = (
  userId: string,
  movieId: string,
  entry: ImportEntry,
  existing: LibraryState | undefined,
) => Promise<LibraryState | null>;

// Each unknown title costs two TMDB calls; eight workers keep the shared TMDB
// scheduler busy without starving other users' requests.
const IMPORT_CONCURRENCY = 8;
const MAX_REPORTED_ERRORS = 200;

function parseLetterboxdCsv(buffer: Buffer): LetterboxdCsvRow[] | null {
  try {
    return parse(buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
      relax_column_count: true,
    }) as LetterboxdCsvRow[];
  } catch {
    return null;
  }
}

function rowToEntry(row: LetterboxdCsvRow, watched: boolean): ImportEntry {
  const year = parseInt(row.Year ?? '', 10);
  const rating = parseFloat(row.Rating ?? '');
  return {
    title: (row.Name ?? '').trim(),
    year: Number.isFinite(year) ? year : null,
    watched,
    rating: Number.isFinite(rating) ? rating : null,
  };
}

/** Collapse repeated rows (e.g. rewatches) to the last occurrence so parallel workers never race on one film. */
function dedupeEntries(entries: ImportEntry[]): ImportEntry[] {
  const byKey = new Map<string, ImportEntry>();
  for (const e of entries) {
    const key = `${e.title.toLowerCase()}|${e.year ?? ''}`;
    byKey.delete(key);
    byKey.set(key, e);
  }
  return Array.from(byKey.values());
}

async function runImport(userId: string, rawEntries: ImportEntry[], apply: ApplyEntry): Promise<ImportResults> {
  const entries = dedupeEntries(rawEntries);
  const results: ImportResults = {
    imported: 0,
    skipped: rawEntries.length - entries.length,
    failed: 0,
    total: rawEntries.length,
    errors: [],
  };
  const pushError = (msg: string) => {
    if (results.errors.length < MAX_REPORTED_ERRORS) results.errors.push(msg);
  };

  const library = new Map<string, LibraryState>(
    (await prisma.userMovie.findMany({
      where: { userId },
      select: { movieId: true, onWatchlist: true, watched: true },
    })).map((um) => [um.movieId, { onWatchlist: um.onWatchlist, watched: um.watched }]),
  );

  await mapWithConcurrency(entries, IMPORT_CONCURRENCY, async (entry) => {
    if (!entry.title) {
      results.failed++;
      pushError('Row missing movie name');
      return;
    }
    try {
      const movie = await findOrCreateMovie(entry.title, entry.year ?? undefined);
      if (!movie) {
        results.failed++;
        pushError(`"${entry.title}" (${entry.year ?? '?'}) — not found on TMDb`);
        return;
      }
      const next = await apply(userId, movie.id, entry, library.get(movie.id));
      if (!next) {
        results.skipped++;
        return;
      }
      // Keeps duplicate rows in the same file from being counted twice.
      library.set(movie.id, next);
      results.imported++;
    } catch {
      results.failed++;
      pushError(`"${entry.title}" — processing error`);
    }
  });

  return results;
}

const LIBRARY_SELECT = { onWatchlist: true, watched: true } as const;

const applyWatchlistCsv: ApplyEntry = async (userId, movieId, _entry, existing) => {
  if (existing?.onWatchlist) return null;
  return prisma.userMovie.upsert({
    where: { userId_movieId: { userId, movieId } },
    update: { onWatchlist: true, source: 'letterboxd_import' },
    create: { userId, movieId, source: 'letterboxd_import', onWatchlist: true },
    select: LIBRARY_SELECT,
  });
};

const applyRatingsCsv: ApplyEntry = (userId, movieId, entry) =>
  prisma.userMovie.upsert({
    where: { userId_movieId: { userId, movieId } },
    update: { userRating: entry.rating, watched: true, source: 'letterboxd_import' },
    create: { userId, movieId, source: 'letterboxd_import', watched: true, userRating: entry.rating },
    select: LIBRARY_SELECT,
  });

const applyWatchedCsv: ApplyEntry = (userId, movieId) =>
  prisma.userMovie.upsert({
    where: { userId_movieId: { userId, movieId } },
    update: { watched: true, source: 'letterboxd_import' },
    create: { userId, movieId, source: 'letterboxd_import', watched: true },
    select: LIBRARY_SELECT,
  });

const applyLetterboxdProfile: ApplyEntry = async (userId, movieId, entry, existing) => {
  if (entry.watched) {
    return prisma.userMovie.upsert({
      where: { userId_movieId: { userId, movieId } },
      update: { onWatchlist: false, watched: true, userRating: entry.rating, source: 'letterboxd_username' },
      create: { userId, movieId, onWatchlist: false, watched: true, userRating: entry.rating, source: 'letterboxd_username' },
      select: LIBRARY_SELECT,
    });
  }
  if (existing?.watched) return null;
  return prisma.userMovie.upsert({
    where: { userId_movieId: { userId, movieId } },
    update: { onWatchlist: true, source: 'letterboxd_username' },
    create: { userId, movieId, onWatchlist: true, source: 'letterboxd_username' },
    select: LIBRARY_SELECT,
  });
};

function csvImportRoute(kind: 'Watchlist' | 'Ratings' | 'Watched', watched: boolean, apply: ApplyEntry) {
  return async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const records = parseLetterboxdCsv(req.file.buffer);
      if (!records) {
        res.status(400).json({ error: 'Invalid CSV format. Please upload a valid Letterboxd export file.' });
        return;
      }
      if (records.length > 0 && !records[0].Name) {
        res.status(400).json({ error: "CSV is missing expected columns. Make sure you're uploading a Letterboxd export." });
        return;
      }

      const entries = records.map((row) => rowToEntry(row, watched));
      const results = await runImport(req.userId!, entries, apply);
      res.json({ message: `${kind} import complete`, results });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Import failed' });
    }
  };
}

router.post('/watchlist', authenticateUser, upload.single('file'), csvImportRoute('Watchlist', false, applyWatchlistCsv));
router.post('/ratings', authenticateUser, upload.single('file'), csvImportRoute('Ratings', true, applyRatingsCsv));
router.post('/watched', authenticateUser, upload.single('file'), csvImportRoute('Watched', true, applyWatchedCsv));

const USERNAME_RE = /^[A-Za-z0-9_-]{1,30}$/;

router.post('/letterboxd', authenticateUser, async (req: AuthRequest, res: Response) => {
  try {
    const raw = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const username = raw.replace(/^@/, '');
    if (!username || !USERNAME_RE.test(username)) {
      res.status(400).json({ error: 'Invalid username', code: 'invalid_username' });
      return;
    }

    let watchlist: FilmEntry[] = [];
    let rated: RatedEntry[] = [];
    try {
      await withScrapeSlot(async () => {
        const jar = createCookieJar();
        const sessionNumber = createSessionNumber();
        await assertProfileExists(username, jar, sessionNumber);
        [watchlist, rated] = await Promise.all([
          fetchWatchlist(username, jar, sessionNumber),
          fetchRated(username, jar, sessionNumber),
        ]);
      });
    } catch (err) {
      if (err instanceof LetterboxdProfileNotFound) {
        res.status(404).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof LetterboxdProfilePrivate) {
        res.status(403).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof LetterboxdRateLimited) {
        res.status(429).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof LetterboxdMarkupError) {
        console.error('[letterboxd] markup error', { username, context: err.context, message: err.message });
        res.status(502).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }

    const bySlug = new Map<string, { title: string; year: number | null; watched: boolean; rating: number | null }>();
    for (const f of watchlist) {
      bySlug.set(f.slug, { title: f.title, year: f.year, watched: false, rating: null });
    }
    for (const f of rated) {
      const prev = bySlug.get(f.slug);
      bySlug.set(f.slug, {
        title: f.title,
        year: f.year ?? prev?.year ?? null,
        watched: true,
        rating: f.rating ?? null,
      });
    }

    const userId = req.userId!;
    const entries: ImportEntry[] = Array.from(bySlug.values());
    const results = await runImport(userId, entries, applyLetterboxdProfile);

    await prisma.user.update({
      where: { id: userId },
      data: { letterboxdUsername: username },
    });

    res.json({ message: 'Letterboxd import complete', results, username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Import failed' });
  }
});

export default router;
