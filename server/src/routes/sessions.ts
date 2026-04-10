import { Router, Response } from 'express';
import { prisma } from '../app';
import { emit } from '../services/emitter';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CLIENT_URL } from '../config';
import { applyMovieFilters, MovieFilters } from '../lib/filterMovies';
import { resolveSessionRole } from '../lib/resolveSessionRole';
import { getInCinemaIds, attachInCinema } from '../services/cinemaStatus';
import type { Movie } from '@prisma/client';

const router = Router();

type SessionWithMovies = {
  movies?: { movie: Movie }[];
  matches?: { movie: Movie }[];
} & Record<string, unknown>;

function assertGroupJoinable(
  session: { type: string; status: string; userId: string | null; user2Id: string | null } | null,
  userId: string,
): { status: number; error: string } | null {
  if (!session) return { status: 404, error: 'Session not found' };
  if (session.type !== 'group') return { status: 400, error: 'Not a group session' };
  if (session.status !== 'waiting') return { status: 400, error: 'Session has already started' };
  if (session.userId === userId) return { status: 400, error: 'You are the host' };
  if (session.user2Id && session.user2Id !== userId) {
    return { status: 400, error: 'Session already has a second participant' };
  }
  return null;
}

const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateShortCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SHORT_CODE_ALPHABET[Math.floor(Math.random() * SHORT_CODE_ALPHABET.length)];
  }
  return out;
}

async function assignShortCode(sessionId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateShortCode();
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "swipe_sessions" WHERE "short_code" = ${code} LIMIT 1
    `;
    if (existing.length > 0) continue;
    try {
      await prisma.$executeRaw`UPDATE "swipe_sessions" SET "short_code" = ${code} WHERE "id" = ${sessionId}`;
      return code;
    } catch (err) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'P2002' || errCode === '23505') continue;
      throw err;
    }
  }
  return null;
}

async function decorateSession<T extends SessionWithMovies | null>(session: T): Promise<T> {
  if (!session) return session;
  const set = await getInCinemaIds();
  return {
    ...session,
    movies: session.movies?.map((sm) => ({ ...sm, movie: attachInCinema(sm.movie, set) })),
    matches: session.matches?.map((m) => ({ ...m, movie: attachInCinema(m.movie, set) })),
  } as T;
}

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

    const shortCode = await assignShortCode(session.id);

    const shareLink = `${CLIENT_URL}/join/${session.id}`;
    res.status(201).json({ session: { ...session, shortCode }, shareLink, shortCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/join', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.params.id as string;

    const session = await prisma.swipeSession.findUnique({ where: { id: sessionId } });
    const check = assertGroupJoinable(session, req.userId!);
    if (check) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const updated = await prisma.swipeSession.update({
      where: { id: sessionId },
      data: { user2Id: req.userId },
    });

    res.json({ session: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/invite', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.params.id as string;
    const userId = req.userId!;
    const { friendIds } = req.body as { friendIds?: string[] };
    const ids = Array.isArray(friendIds) ? friendIds.filter((s) => typeof s === 'string' && s.length > 0) : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'friendIds is required' });
      return;
    }

    const session = await prisma.swipeSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.userId !== userId) {
      res.status(403).json({ error: 'Only the host can invite friends' });
      return;
    }
    if (session.type !== 'group') {
      res.status(400).json({ error: 'Only group sessions can have invites' });
      return;
    }
    if (session.status !== 'waiting') {
      res.status(400).json({ error: 'Session has already started' });
      return;
    }

    const friendships = await prisma.$queryRaw<{ other_id: string }[]>`
      SELECT CASE WHEN requester_id = ${userId} THEN addressee_id ELSE requester_id END as other_id
      FROM friendships
      WHERE status = 'accepted'
        AND ((requester_id = ${userId} AND addressee_id = ANY(${ids}::text[]))
          OR (addressee_id = ${userId} AND requester_id = ANY(${ids}::text[])))
    `;
    const acceptedFriendIds = new Set(friendships.map((f) => f.other_id));
    const validIds = ids.filter((id) => acceptedFriendIds.has(id));
    if (validIds.length === 0) {
      res.status(400).json({ error: 'No valid friends to invite' });
      return;
    }

    const host = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });

    const created: { id: string; to_user_id: string }[] = [];
    for (const toId of validIds) {
      const rows = await prisma.$queryRaw<{ id: string; to_user_id: string }[]>`
        INSERT INTO session_invites (id, session_id, from_user_id, to_user_id, status, created_at, expires_at)
        VALUES (gen_random_uuid()::text, ${sessionId}, ${userId}, ${toId}, 'pending', NOW(), NOW() + INTERVAL '24 hours')
        RETURNING id, to_user_id
      `;
      if (rows[0]) created.push(rows[0]);
    }

    for (const row of created) {
      emit(`user:${row.to_user_id}`, 'session-invite', {
        inviteId: row.id,
        sessionId,
        hostName: host?.displayName ?? 'A friend',
      });
    }

    res.status(201).json({ invited: created.length });
  } catch (err) {
    console.error('[sessions] invite failed', err);
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
      res.json({ added: 0, session: await decorateSession(refreshed) });
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
    const decoratedSession = await decorateSession(updatedSession);

    emit(`session:${sessionId}`, 'new-batch', {
      added: newMovies.length,
      session: decoratedSession,
    });

    res.json({ added: newMovies.length, session: decoratedSession });
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
      res.json({ session: await decorateSession(groupSession), isUser1 });
      return;
    }

    res.status(404).json({ error: 'No active session' });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/by-code/:code', async (req, res: Response) => {
  try {
    const code = String(req.params.code ?? '').toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(code)) {
      res.status(400).json({ error: 'Invalid code' });
      return;
    }
    const rows = await prisma.$queryRaw<{ id: string; status: string }[]>`
      SELECT "id", "status" FROM "swipe_sessions" WHERE "short_code" = ${code} LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (row.status === 'completed') {
      res.status(400).json({ error: 'This session has already ended' });
      return;
    }
    res.json({ sessionId: row.id });
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

    res.json({ session: await decorateSession(session), isUser1 });
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

    const inCinemaSet = await getInCinemaIds();
    const history = sessions.map((s) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      createdAt: s.createdAt,
      movieCount: s._count.movies,
      matchCount: s.matches.length,
      matches: s.matches.map((m) => ({
        id: m.id,
        movie: attachInCinema(m.movie, inCinemaSet),
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
