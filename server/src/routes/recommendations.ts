import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { findOrCreateMovieByTmdbId } from '../services/tmdb';
import {
  buildForYouRecommendations,
  buildSimilarRecommendations,
} from '../services/recommendations';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const recommendations = await buildForYouRecommendations(req.userId!, 20);
    res.json({ recommendations });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/similar/:tmdbId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tmdbId = parseInt(req.params.tmdbId as string);
    if (isNaN(tmdbId)) {
      res.status(400).json({ error: 'Invalid tmdbId' });
      return;
    }

    const recommendations = await buildSimilarRecommendations(tmdbId, req.userId!);
    res.json({ recommendations });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/dismiss/:tmdbId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tmdbId = parseInt(req.params.tmdbId as string);
    if (isNaN(tmdbId)) {
      res.status(400).json({ error: 'Invalid tmdbId' });
      return;
    }

    const movie = await prisma.movie.findUnique({ where: { tmdbId } });
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    await prisma.userMovie.deleteMany({
      where: { userId: req.userId!, movieId: movie.id, source: 'dismissed' },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/dismiss', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { tmdbId } = req.body;
    if (!tmdbId || typeof tmdbId !== 'number') {
      res.status(400).json({ error: 'tmdbId is required' });
      return;
    }

    const movie = await findOrCreateMovieByTmdbId(tmdbId);
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    await prisma.userMovie.upsert({
      where: { userId_movieId: { userId: req.userId!, movieId: movie.id } },
      update: { source: 'dismissed' },
      create: {
        userId: req.userId!,
        movieId: movie.id,
        source: 'dismissed',
        onWatchlist: false,
        watched: false,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
