import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/create', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { filters } = req.body;

    const couple = await prisma.couple.findFirst({
      where: {
        OR: [
          { user1Id: req.userId! },
          { user2Id: req.userId! },
        ],
      },
    });

    if (!couple || !couple.user2Id) {
      res.status(400).json({ error: 'You need to be in a complete couple to start a session' });
      return;
    }

    const watchlistMovies = await prisma.userMovie.findMany({
      where: {
        userId: { in: [couple.user1Id, couple.user2Id] },
        onWatchlist: true,
      },
      include: { movie: true },
    });

    const movieMap = new Map<string, typeof watchlistMovies[0]['movie']>();
    for (const um of watchlistMovies) {
      movieMap.set(um.movieId, um.movie);
    }

    let moviePool = Array.from(movieMap.values());

    if (filters) {
      if (filters.genres && filters.genres.length > 0) {
        moviePool = moviePool.filter((m) => {
          const movieGenres = m.genres as string[];
          return filters.genres.some((g: string) => movieGenres.includes(g));
        });
      }
      if (filters.decade) {
        const decadeStart = parseInt(filters.decade);
        moviePool = moviePool.filter((m) => m.year && m.year >= decadeStart && m.year < decadeStart + 10);
      }
      if (filters.minRating) {
        moviePool = moviePool.filter((m) => m.tmdbRating && m.tmdbRating >= filters.minRating);
      }
      if (filters.maxRuntime) {
        moviePool = moviePool.filter((m) => m.runtime && m.runtime <= filters.maxRuntime);
      }
      if (filters.streamingProvider) {
        moviePool = moviePool.filter((m) => {
          const providers = m.streamingProviders as { name: string; type: string }[];
          return providers.some((p) => p.name === filters.streamingProvider && p.type === 'stream');
        });
      }
    }

    if (moviePool.length === 0) {
      res.status(400).json({
        error: 'No movies match your filters. Try adjusting your filters or adding more movies to your watchlists.',
      });
      return;
    }

    const session = await prisma.swipeSession.create({
      data: {
        coupleId: couple.id,
        filters: filters || {},
      },
    });

    await prisma.sessionMovie.createMany({
      data: moviePool.map((m) => ({
        sessionId: session.id,
        movieId: m.id,
      })),
    });

    const fullSession = await prisma.swipeSession.findUnique({
      where: { id: session.id },
      include: {
        movies: { include: { movie: true } },
      },
    });

    res.status(201).json({ session: fullSession });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/active', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const couple = await prisma.couple.findFirst({
      where: {
        OR: [
          { user1Id: req.userId! },
          { user2Id: req.userId! },
        ],
      },
    });

    if (!couple) {
      res.status(404).json({ error: 'Not in a couple' });
      return;
    }

    const session = await prisma.swipeSession.findFirst({
      where: {
        coupleId: couple.id,
        status: { in: ['active', 'swiping'] },
      },
      include: {
        movies: { include: { movie: true } },
        matches: { include: { movie: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      res.status(404).json({ error: 'No active session' });
      return;
    }

    const isUser1 = couple.user1Id === req.userId;

    res.json({ session, isUser1, couple });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.params.id as string;
    const session = await prisma.swipeSession.findUnique({
      where: { id: sessionId },
      include: {
        movies: { include: { movie: true } },
        matches: { include: { movie: true } },
        couple: true,
      },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.couple.user1Id !== req.userId && session.couple.user2Id !== req.userId) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    const isUser1 = session.couple.user1Id === req.userId;

    res.json({ session, isUser1 });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/history/all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const couple = await prisma.couple.findFirst({
      where: {
        OR: [
          { user1Id: req.userId! },
          { user2Id: req.userId! },
        ],
      },
    });

    if (!couple) {
      res.status(404).json({ error: 'Not in a couple' });
      return;
    }

    const sessions = await prisma.swipeSession.findMany({
      where: { coupleId: couple.id },
      include: {
        matches: { include: { movie: true } },
        _count: { select: { movies: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const history = sessions.map((s) => ({
      id: s.id,
      status: s.status,
      createdAt: s.createdAt,
      movieCount: s._count.movies,
      matchCount: s.matches.length,
      matches: s.matches.map((m) => ({
        id: m.id,
        movie: m.movie,
        watched: m.watched,
        watchedAt: m.watchedAt,
      })),
    }));

    res.json({ sessions: history });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
