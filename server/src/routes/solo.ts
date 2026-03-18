import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { applyMovieFilters } from '../lib/filterMovies';

const router = Router();

function parseBatchSize(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && value > 0) return Math.floor(value);
  return 50;
}

router.get('/active', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.swipeSession.findFirst({
      where: {
        userId: req.userId,
        type: 'solo',
        status: 'swiping',
      },
      include: {
        movies: {
          include: { movie: true },
        },
      },
    });

    if (!session) {
      res.json({ session: null });
      return;
    }

    res.json({ session });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/create', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { filters } = req.body;
    const batchSize = parseBatchSize(req.body.batchSize);

    const movieWhere = {
      userMovies: {
        some: {
          userId: req.userId!,
          onWatchlist: true,
          watched: false,
        },
      },
    };

    let watchlistMovies = applyMovieFilters(
      await prisma.movie.findMany({ where: movieWhere }),
      filters || {}
    );

    for (let i = watchlistMovies.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [watchlistMovies[i], watchlistMovies[j]] = [watchlistMovies[j], watchlistMovies[i]];
    }
    if (batchSize != null) {
      watchlistMovies = watchlistMovies.slice(0, batchSize);
    }

    if (watchlistMovies.length === 0) {
      res.status(400).json({ error: 'No unwatched movies found in your watchlist' });
      return;
    }

    await prisma.swipeSession.updateMany({
      where: {
        userId: req.userId,
        type: 'solo',
        status: 'swiping',
      },
      data: { status: 'completed' },
    });

    const session = await prisma.swipeSession.create({
      data: {
        type: 'solo',
        userId: req.userId,
        status: 'swiping',
        filters: filters || {},
        batchSize,
        movies: {
          create: watchlistMovies.map((m) => ({
            movieId: m.id,
          })),
        },
      },
      include: {
        movies: {
          include: { movie: true },
        },
      },
    });

    res.status(201).json({ session });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

export default router;
