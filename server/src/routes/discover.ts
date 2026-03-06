import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { discoverMovies, shapeTmdbSearchResult } from '../services/tmdb';
import { mapGenreNamesToIds } from '../services/tmdbGenres';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const genreNames = typeof req.query.genres === 'string' && req.query.genres.length > 0
      ? req.query.genres.split(',').map((g) => g.trim()).filter(Boolean)
      : [];
    const genreIds = mapGenreNamesToIds(genreNames);

    const minRating = req.query.minRating ? parseFloat(req.query.minRating as string) : undefined;
    const decade = typeof req.query.decade === 'string' && req.query.decade.length > 0
      ? parseInt(req.query.decade, 10)
      : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

    let releaseDateGte: string | undefined;
    let releaseDateLte: string | undefined;
    if (decade && !isNaN(decade)) {
      releaseDateGte = `${decade}-01-01`;
      releaseDateLte = `${decade + 9}-12-31`;
    }

    const { results, totalPages } = await discoverMovies({
      genreIds,
      minRating,
      releaseDateGte,
      releaseDateLte,
      page: !isNaN(page) && page > 0 ? page : 1,
    });

    const library = await prisma.userMovie.findMany({
      where: { userId: req.userId! },
      select: { movie: { select: { tmdbId: true } } },
    });
    const excluded = new Set(library.map((r) => r.movie.tmdbId).filter((id): id is number => id !== null));

    const movies = results
      .filter((r) => !excluded.has(r.id))
      .map(shapeTmdbSearchResult);

    res.json({ movies, totalPages, page: !isNaN(page) && page > 0 ? page : 1 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
