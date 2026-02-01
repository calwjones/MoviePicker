import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { applyMovieFilters } from '../lib/filterMovies';

const router = Router();

// Get active solo session
router.get('/active', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.swipeSession.findFirst({
      where: {
        userId: req.userId,
        type: 'solo',
        status: { in: ['active', 'swiping'] },
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

// Create a new solo session
router.post('/create', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { filters } = req.body;

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

    // Shuffle (Fisher-Yates) then cap at 50
    for (let i = watchlistMovies.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [watchlistMovies[i], watchlistMovies[j]] = [watchlistMovies[j], watchlistMovies[i]];
    }
    watchlistMovies = watchlistMovies.slice(0, 50);

    if (watchlistMovies.length === 0) {
      res.status(400).json({ error: 'No unwatched movies found in your watchlist' });
      return;
    }

    // Cancel any existing active solo sessions
    await prisma.swipeSession.updateMany({
      where: {
        userId: req.userId,
        type: 'solo',
        status: { in: ['active', 'swiping'] },
      },
      data: { status: 'completed' },
    });

    // Create session
    const session = await prisma.swipeSession.create({
      data: {
        type: 'solo',
        userId: req.userId,
        coupleId: null,
        status: 'swiping',
        filters: filters || {},
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
