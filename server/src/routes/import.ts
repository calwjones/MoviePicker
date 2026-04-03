import { Router, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { authenticate, AuthRequest } from '../middleware/auth';
import { findOrCreateMovie } from '../services/tmdb';
import { prisma } from '../app';
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

interface LetterboxdWatchlistRow {
  Date: string;
  Name: string;
  Year: string;
  'Letterboxd URI': string;
}

interface LetterboxdRatingsRow {
  Date: string;
  Name: string;
  Year: string;
  'Letterboxd URI': string;
  Rating: string;
}

interface LetterboxdWatchedRow {
  Date: string;
  Name: string;
  Year: string;
  'Letterboxd URI': string;
}

router.post('/watchlist', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const csvContent = req.file.buffer.toString('utf-8');
    let records: LetterboxdWatchlistRow[];
    try {
      records = parse(csvContent, { columns: true, skip_empty_lines: true });
    } catch {
      res.status(400).json({ error: 'Invalid CSV format. Please upload a valid Letterboxd export file.' });
      return;
    }

    if (records.length > 0 && !records[0].Name) {
      res.status(400).json({ error: "CSV is missing expected columns. Make sure you're uploading a Letterboxd export." });
      return;
    }

    const results = { imported: 0, skipped: 0, failed: 0, total: records.length, errors: [] as string[] };

    for (const row of records) {
      try {
        if (!row.Name) {
          results.failed++;
          results.errors.push('Row missing movie name');
          continue;
        }

        const movie = await findOrCreateMovie(row.Name, parseInt(row.Year));
        if (!movie) {
          results.failed++;
          results.errors.push(`"${row.Name}" (${row.Year}) — not found on TMDb`);
          continue;
        }

        const existing = await prisma.userMovie.findUnique({
          where: { userId_movieId: { userId: req.userId!, movieId: movie.id } },
        });

        if (existing?.onWatchlist) {
          results.skipped++;
          continue;
        }

        await prisma.userMovie.upsert({
          where: {
            userId_movieId: { userId: req.userId!, movieId: movie.id },
          },
          update: { onWatchlist: true, source: 'letterboxd_import' },
          create: {
            userId: req.userId!,
            movieId: movie.id,
            source: 'letterboxd_import',
            onWatchlist: true,
          },
        });
        results.imported++;
      } catch {
        results.failed++;
        results.errors.push(`"${row.Name}" — processing error`);
      }
    }

    res.json({ message: 'Watchlist import complete', results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Import failed' });
  }
});

router.post('/ratings', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const csvContent = req.file.buffer.toString('utf-8');
    let records: LetterboxdRatingsRow[];
    try {
      records = parse(csvContent, { columns: true, skip_empty_lines: true });
    } catch {
      res.status(400).json({ error: 'Invalid CSV format.' });
      return;
    }

    const results = { imported: 0, skipped: 0, failed: 0, total: records.length, errors: [] as string[] };

    for (const row of records) {
      try {
        if (!row.Name) {
          results.failed++;
          continue;
        }

        const movie = await findOrCreateMovie(row.Name, parseInt(row.Year));
        if (!movie) {
          results.failed++;
          results.errors.push(`"${row.Name}" (${row.Year}) — not found on TMDb`);
          continue;
        }

        const rating = parseFloat(row.Rating);
        await prisma.userMovie.upsert({
          where: {
            userId_movieId: { userId: req.userId!, movieId: movie.id },
          },
          update: {
            userRating: isNaN(rating) ? null : rating,
            watched: true,
            source: 'letterboxd_import',
          },
          create: {
            userId: req.userId!,
            movieId: movie.id,
            source: 'letterboxd_import',
            watched: true,
            userRating: isNaN(rating) ? null : rating,
          },
        });
        results.imported++;
      } catch {
        results.failed++;
      }
    }

    res.json({ message: 'Ratings import complete', results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Import failed' });
  }
});

router.post('/watched', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const csvContent = req.file.buffer.toString('utf-8');
    let records: LetterboxdWatchedRow[];
    try {
      records = parse(csvContent, { columns: true, skip_empty_lines: true });
    } catch {
      res.status(400).json({ error: 'Invalid CSV format.' });
      return;
    }

    const results = { imported: 0, skipped: 0, failed: 0, total: records.length, errors: [] as string[] };

    for (const row of records) {
      try {
        if (!row.Name) {
          results.failed++;
          continue;
        }

        const movie = await findOrCreateMovie(row.Name, parseInt(row.Year));
        if (!movie) {
          results.failed++;
          results.errors.push(`"${row.Name}" (${row.Year}) — not found on TMDb`);
          continue;
        }

        await prisma.userMovie.upsert({
          where: {
            userId_movieId: { userId: req.userId!, movieId: movie.id },
          },
          update: { watched: true, source: 'letterboxd_import' },
          create: {
            userId: req.userId!,
            movieId: movie.id,
            source: 'letterboxd_import',
            watched: true,
          },
        });
        results.imported++;
      } catch {
        results.failed++;
      }
    }

    res.json({ message: 'Watched import complete', results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Import failed' });
  }
});

const USERNAME_RE = /^[A-Za-z0-9_-]{1,30}$/;

router.post('/letterboxd', authenticate, async (req: AuthRequest, res: Response) => {
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

    const results = { imported: 0, skipped: 0, failed: 0, total: bySlug.size, errors: [] as string[] };
    const userId = req.userId!;
    const entries = Array.from(bySlug.values());
    const CHUNK_SIZE = 15;

    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(async (entry) => {
        try {
          const movie = await findOrCreateMovie(entry.title, entry.year ?? undefined);
          if (!movie) {
            results.failed++;
            results.errors.push(`"${entry.title}" (${entry.year ?? '?'}) — not found on TMDb`);
            return;
          }

          if (entry.watched) {
            await prisma.userMovie.upsert({
              where: { userId_movieId: { userId, movieId: movie.id } },
              update: {
                onWatchlist: false,
                watched: true,
                userRating: entry.rating,
                source: 'letterboxd_username',
              },
              create: {
                userId,
                movieId: movie.id,
                onWatchlist: false,
                watched: true,
                userRating: entry.rating,
                source: 'letterboxd_username',
              },
            });
          } else {
            const existing = await prisma.userMovie.findUnique({
              where: { userId_movieId: { userId, movieId: movie.id } },
            });
            if (existing?.watched) {
              results.skipped++;
              return;
            }
            await prisma.userMovie.upsert({
              where: { userId_movieId: { userId, movieId: movie.id } },
              update: { onWatchlist: true, source: 'letterboxd_username' },
              create: {
                userId,
                movieId: movie.id,
                onWatchlist: true,
                source: 'letterboxd_username',
              },
            });
          }
          results.imported++;
        } catch {
          results.failed++;
          results.errors.push(`"${entry.title}" — processing error`);
        }
      }));
    }

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
