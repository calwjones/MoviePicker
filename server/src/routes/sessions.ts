import { Router, Response } from 'express';
import { prisma } from '../app';
import { emit } from '../services/emitter';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CLIENT_URL } from '../config';
import { applyMovieFilters } from '../lib/filterMovies';
import { resolveSessionRole } from '../lib/resolveSessionRole';

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

    // Cancel any existing active sessions for this couple
    await prisma.swipeSession.updateMany({
      where: { coupleId: couple.id, status: { in: ['active', 'swiping'] } },
      data: { status: 'completed' },
    });

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

    const moviePool = applyMovieFilters(Array.from(movieMap.values()), filters || {});

    // Shuffle (Fisher-Yates) so sessions aren't always the same order
    for (let i = moviePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [moviePool[i], moviePool[j]] = [moviePool[j], moviePool[i]];
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

    emit(`couple:${couple.id}`, 'session-created', { sessionId: session.id, session: fullSession, createdBy: req.userId });

    const shareLink = `${CLIENT_URL}/join/${session.id}`;
    res.status(201).json({ session: fullSession, shareLink });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/create-guest', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { filters } = req.body;

    const watchlistMovies = await prisma.userMovie.findMany({
      where: {
        userId: req.userId!,
        onWatchlist: true,
        watched: false,
      },
      include: { movie: true },
    });

    let moviePool = applyMovieFilters(
      watchlistMovies.map((um) => um.movie),
      filters || {}
    );

    // Shuffle (Fisher-Yates)
    for (let i = moviePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [moviePool[i], moviePool[j]] = [moviePool[j], moviePool[i]];
    }

    if (moviePool.length === 0) {
      res.status(400).json({
        error: 'No movies match your filters. Try adjusting your filters or adding more movies.',
      });
      return;
    }

    // Cancel any existing active guest sessions for this user
    await prisma.swipeSession.updateMany({
      where: {
        userId: req.userId,
        type: 'guest',
        status: { in: ['active', 'swiping'] },
      },
      data: { status: 'completed' },
    });

    const session = await prisma.swipeSession.create({
      data: {
        type: 'guest',
        userId: req.userId,
        coupleId: null,
        filters: filters || {},
        movies: {
          create: moviePool.map((m) => ({ movieId: m.id })),
        },
      },
      include: {
        movies: { include: { movie: true } },
      },
    });

    const shareLink = `${CLIENT_URL}/join/${session.id}`;
    res.status(201).json({ session, shareLink });
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

    const { isUser1, isUser2, isGuest } = resolveSessionRole(req, session);

    if (!isUser1 && !isUser2 && !isGuest) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

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

    const sessions = await prisma.swipeSession.findMany({
      where: {
        OR: [
          ...(couple ? [{ coupleId: couple.id }] : []),
          { userId: req.userId!, type: { in: ['solo', 'guest'] } },
        ],
      },
      include: {
        matches: { include: { movie: true } },
        _count: { select: { movies: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const history = sessions.map((s: (typeof sessions)[number]) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      createdAt: s.createdAt,
      movieCount: s._count.movies,
      matchCount: s.matches.length,
      matches: s.matches.map((m: (typeof s.matches)[number]) => ({
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

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.params.id as string;
    const session = await prisma.swipeSession.findUnique({
      where: { id: sessionId },
      include: { couple: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const isSolo = session.type === 'solo';
    const isOwner = isSolo
      ? session.userId === req.userId
      : session.couple?.user1Id === req.userId || session.couple?.user2Id === req.userId;

    if (!isOwner) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    await prisma.swipeSession.update({
      where: { id: sessionId },
      data: { status: 'completed' },
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
