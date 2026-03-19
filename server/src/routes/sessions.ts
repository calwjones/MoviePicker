import { Router, Response } from 'express';
import { prisma } from '../app';
import { emit } from '../services/emitter';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CLIENT_URL } from '../config';
import { applyMovieFilters, MovieFilters } from '../lib/filterMovies';
import { resolveSessionRole } from '../lib/resolveSessionRole';
import type { Movie } from '@prisma/client';

const router = Router();

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseBatchSize(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && value > 0) return Math.floor(value);
  return 50;
}

async function buildGroupPool(
  hostId: string,
  user2Id: string | null,
  filters: MovieFilters,
  batchSize: number | null,
  excludeMovieIds: Set<string> = new Set(),
): Promise<Movie[]> {
  const MIN_SHARED = 15;

  const hostMovies = await prisma.userMovie.findMany({
    where: { userId: hostId, onWatchlist: true, watched: false },
    include: { movie: true },
  });
  const hostPool = applyMovieFilters(
    hostMovies.map((um) => um.movie).filter((m) => !excludeMovieIds.has(m.id)),
    filters,
  );

  const capped = (pool: Movie[]) => (batchSize != null ? pool.slice(0, batchSize) : pool);

  if (!user2Id) {
    return capped(shuffle([...hostPool]));
  }

  const user2Movies = await prisma.userMovie.findMany({
    where: { userId: user2Id, onWatchlist: true, watched: false },
    include: { movie: true },
  });
  const user2Pool = applyMovieFilters(
    user2Movies.map((um) => um.movie).filter((m) => !excludeMovieIds.has(m.id)),
    filters,
  );

  const user2Ids = new Set(user2Pool.map((m) => m.id));
  const intersection = hostPool.filter((m) => user2Ids.has(m.id));

  let pool: Movie[];
  if (intersection.length >= MIN_SHARED) {
    pool = shuffle([...intersection]);
  } else {
    const intersectionIds = new Set(intersection.map((m) => m.id));
    const unionMap = new Map<string, Movie>();
    for (const m of [...hostPool, ...user2Pool]) {
      if (!intersectionIds.has(m.id)) unionMap.set(m.id, m);
    }
    const fillCap = batchSize != null
      ? Math.max(0, batchSize - intersection.length)
      : unionMap.size;
    const fill = shuffle(Array.from(unionMap.values())).slice(0, fillCap);
    pool = shuffle([...intersection, ...fill]);
  }

  return capped(pool);
}

async function sampleSoloBatch(
  userId: string,
  filters: MovieFilters,
  batchSize: number | null,
  excludeMovieIds: Set<string> = new Set(),
): Promise<Movie[]> {
  const movies = await prisma.movie.findMany({
    where: {
      userMovies: {
        some: { userId, onWatchlist: true, watched: false },
      },
    },
  });
  const filtered = applyMovieFilters(
    movies.filter((m) => !excludeMovieIds.has(m.id)),
    filters,
  );
  const shuffled = shuffle([...filtered]);
  return batchSize != null ? shuffled.slice(0, batchSize) : shuffled;
}

router.post('/group', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { filters } = req.body;
    const batchSize = parseBatchSize(req.body.batchSize);

    await prisma.swipeSession.updateMany({
      where: {
        userId: req.userId,
        type: 'group',
        status: { in: ['waiting', 'swiping'] },
      },
      data: { status: 'completed' },
    });

    const session = await prisma.swipeSession.create({
      data: {
        type: 'group',
        userId: req.userId,
        status: 'waiting',
        filters: filters || {},
        batchSize,
      },
    });

    const shareLink = `${CLIENT_URL}/join/${session.id}`;
    res.status(201).json({ session, shareLink });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/join', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.params.id as string;

    const session = await prisma.swipeSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.type !== 'group') {
      res.status(400).json({ error: 'Not a group session' });
      return;
    }
    if (session.status !== 'waiting') {
      res.status(400).json({ error: 'Session has already started' });
      return;
    }
    if (session.userId === req.userId) {
      res.status(400).json({ error: 'You are the host' });
      return;
    }
    if (session.user2Id && session.user2Id !== req.userId) {
      res.status(400).json({ error: 'Session already has a second participant' });
      return;
    }

    const updated = await prisma.swipeSession.update({
      where: { id: sessionId },
      data: { user2Id: req.userId },
    });

    const joiner = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { displayName: true },
    });

    emit(`session:${sessionId}`, 'participant-joined', {
      displayName: joiner?.displayName,
      type: 'registered',
    });

    res.json({ session: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.params.id as string;

    const session = await prisma.swipeSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.userId !== req.userId) {
      res.status(403).json({ error: 'Only the host can start the session' });
      return;
    }
    if (session.status !== 'waiting') {
      res.status(400).json({ error: 'Session is not in waiting state' });
      return;
    }

    const moviePool = await buildGroupPool(
      session.userId!,
      session.user2Id ?? null,
      (session.filters ?? {}) as MovieFilters,
      session.batchSize,
    );

    if (moviePool.length === 0) {
      res.status(400).json({
        error: 'No movies match your filters. Try adjusting filters or adding more movies.',
      });
      return;
    }

    await prisma.$transaction([
      prisma.sessionMovie.createMany({
        data: moviePool.map((m) => ({ sessionId, movieId: m.id })),
      }),
      prisma.swipeSession.update({
        where: { id: sessionId },
        data: { status: 'swiping' },
      }),
    ]);

    emit(`session:${sessionId}`, 'session-started', { sessionId });

    res.json({ sessionId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/another-batch', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.params.id as string;

    const session = await prisma.swipeSession.findUnique({
      where: { id: sessionId },
      include: { movies: true },
    });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.type !== 'solo' && session.type !== 'group') {
      res.status(400).json({ error: 'Another batch is not supported for this session type' });
      return;
    }
    if (session.userId !== req.userId) {
      res.status(403).json({ error: 'Only the owner can extend this session' });
      return;
    }

    const seenMovieIds = new Set(session.movies.map((sm) => sm.movieId));
    const filters = (session.filters ?? {}) as MovieFilters;
    const batchSize = session.batchSize;

    let newMovies: Movie[];
    if (session.type === 'solo') {
      newMovies = await sampleSoloBatch(session.userId!, filters, batchSize, seenMovieIds);
    } else {
      newMovies = await buildGroupPool(
        session.userId!,
        session.user2Id ?? null,
        filters,
        batchSize,
        seenMovieIds,
      );
    }

    if (newMovies.length === 0) {
      const refreshed = await prisma.swipeSession.findUnique({
        where: { id: sessionId },
        include: { movies: { include: { movie: true } }, matches: { include: { movie: true } } },
      });
      res.json({ added: 0, session: refreshed });
      return;
    }

    await prisma.sessionMovie.createMany({
      data: newMovies.map((m) => ({ sessionId, movieId: m.id })),
      skipDuplicates: true,
    });

    if (session.status === 'completed') {
      await prisma.swipeSession.update({
        where: { id: sessionId },
        data: { status: 'swiping' },
      });
    }

    const updatedSession = await prisma.swipeSession.findUnique({
      where: { id: sessionId },
      include: { movies: { include: { movie: true } }, matches: { include: { movie: true } } },
    });

    emit(`session:${sessionId}`, 'new-batch', {
      added: newMovies.length,
      session: updatedSession,
    });

    res.json({ added: newMovies.length, session: updatedSession });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/active', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const groupSession = await prisma.swipeSession.findFirst({
      where: {
        OR: [
          { userId: req.userId, type: 'group', status: { in: ['waiting', 'swiping'] } },
          { user2Id: req.userId, type: 'group', status: { in: ['waiting', 'swiping'] } },
        ],
      },
      include: { movies: { include: { movie: true } }, matches: { include: { movie: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (groupSession) {
      const isUser1 = groupSession.userId === req.userId;
      res.json({ session: groupSession, isUser1 });
      return;
    }

    res.status(404).json({ error: 'No active session' });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/preview', async (req, res: Response) => {
  try {
    const session = await prisma.swipeSession.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { displayName: true } } },
    });
    if (!session || session.status !== 'waiting') {
      res.status(404).json({ error: 'Session not found or already started' });
      return;
    }
    res.json({ hostName: session.user?.displayName ?? null });
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
    const sessions = await prisma.swipeSession.findMany({
      where: {
        OR: [
          { userId: req.userId!, type: { in: ['solo', 'group', 'guest'] } },
          { user2Id: req.userId! },
        ],
      },
      include: {
        matches: { include: { movie: true } },
        _count: { select: { movies: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const history = sessions.map((s) => ({
      id: s.id,
      type: s.type,
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

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.params.id as string;
    const session = await prisma.swipeSession.findUnique({ where: { id: sessionId } });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const isOwner = session.userId === req.userId;

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
