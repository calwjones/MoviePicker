import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getTmdbRecommendations, TMDB_IMAGE_BASE } from '../services/tmdb';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Find the user's highest-rated watchlist movie with a tmdbId as the seed
    const seedMovie = await prisma.userMovie.findFirst({
      where: { userId: req.userId!, onWatchlist: true },
      include: { movie: true },
      orderBy: { movie: { tmdbRating: 'desc' } },
    });

    if (!seedMovie || !seedMovie.movie.tmdbId) {
      res.json({ recommendations: [] });
      return;
    }

    // Get all tmdbIds already in the user's library to filter them out
    const existing = await prisma.userMovie.findMany({
      where: { userId: req.userId! },
      include: { movie: { select: { tmdbId: true } } },
    });
    const knownTmdbIds = new Set(existing.map((um: { movie: { tmdbId: number } }) => um.movie.tmdbId));

    const tmdbRecs = await getTmdbRecommendations(seedMovie.movie.tmdbId);
    const recommendations = tmdbRecs
      .filter((r) => !knownTmdbIds.has(r.id))
      .slice(0, 6)
      .map((r) => ({
        tmdbId: r.id,
        title: r.title,
        year: r.release_date ? parseInt(r.release_date.slice(0, 4)) : null,
        posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
        overview: r.overview || null,
        rating: r.vote_average || null,
      }));

    res.json({ recommendations });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
