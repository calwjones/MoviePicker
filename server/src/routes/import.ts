import { Router, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { authenticate, AuthRequest } from '../middleware/auth';
import { findOrCreateMovie } from '../services/tmdb';
import { prisma } from '../app';

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

export default router;
