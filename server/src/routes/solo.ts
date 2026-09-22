import { Router, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../app';
import { authenticateUser, AuthRequest } from '../middleware/auth';
import { applyMovieFilters } from '../lib/filterMovies';
import { getInCinemaIds, attachInCinema } from '../services/cinemaStatus';
import { refreshStaleInBackground } from '../services/tmdb';
import { parseBatchSize, sanitizeFilters } from '../lib/validate';

const router = Router();

async function decorateSoloSession<T extends { movies?: { movie: { tmdbId: number | null } }[] } | null>(session: T): Promise<T> {
  if (!session) return session;
  const set = await getInCinemaIds();
  return {
    ...session,
    movies: session.movies?.map((sm) => ({ ...sm, movie: attachInCinema(sm.movie, set) })),
  } as T;
}

router.get('/active', authenticateUser, async (req: AuthRequest, res: Response) => {
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

    res.json({ session: await decorateSoloSession(session) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/create', authenticateUser, async (req: AuthRequest, res: Response) => {
  try {
    const filters = sanitizeFilters(req.body.filters);
    const batchSize = parseBatchSize(req.body.batchSize);

    const movieWhere = {
      userMovies: {
        some: {
          userId: req.userId!,
          onWatchlist: true,
        },
      },
    };

    let watchlistMovies = applyMovieFilters(
      await prisma.movie.findMany({ where: movieWhere }),
      filters,
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
        filters: filters as Prisma.InputJsonObject,
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

    refreshStaleInBackground(watchlistMovies);
    res.status(201).json({ session: await decorateSoloSession(session) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
