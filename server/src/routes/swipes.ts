import { Router, Response } from 'express';
import { prisma } from '../app';
import { emit } from '../services/emitter';
import { authenticate, AuthRequest } from '../middleware/auth';
import { resolveSessionRole } from '../lib/resolveSessionRole';
import { getInCinemaIds, attachInCinema } from '../services/cinemaStatus';
import { clearSessionState } from '../services/socket';

const router = Router();

async function getCompromises(sessionId: string) {
  const [movieAggregates, inCinemaSet] = await Promise.all([
    prisma.sessionSwipe.groupBy({
      by: ['movieId', 'direction'],
      where: { sessionId },
      _count: { _all: true },
    }),
    getInCinemaIds(),
  ]);

  type Agg = { right: number; left: number };
  const perMovie = new Map<string, Agg>();
  for (const row of movieAggregates) {
    const agg = perMovie.get(row.movieId) ?? { right: 0, left: 0 };
    if (row.direction === 'right') agg.right = row._count._all;
    else if (row.direction === 'left') agg.left = row._count._all;
    perMovie.set(row.movieId, agg);
  }

  const contested = Array.from(perMovie.entries())
    .filter(([, agg]) => agg.right > 0 && agg.left > 0)
    .map(([movieId, agg]) => ({ movieId, score: agg.right - agg.left }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (contested.length === 0) return [];
  const movies = await prisma.movie.findMany({
    where: { id: { in: contested.map((c) => c.movieId) } },
  });
  const byId = new Map(movies.map((m) => [m.id, m]));
  return contested
    .map((c) => {
      const movie = byId.get(c.movieId);
      if (!movie) return null;
      return {
        id: c.movieId,
        movieId: c.movieId,
        movie: attachInCinema(movie, inCinemaSet),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

async function countActiveParticipants(sessionId: string): Promise<number> {
  return prisma.sessionParticipant.count({ where: { sessionId, leftAt: null } });
}

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, movieId, direction } = req.body;

    if (!sessionId || !movieId || !['left', 'right'].includes(direction)) {
      res.status(400).json({ error: 'sessionId, movieId, and direction (left/right) are required' });
      return;
    }

    const session = await prisma.swipeSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { isSolo, isUser1, participantId } = await resolveSessionRole(req, session);

    if (isSolo && !isUser1) {
      res.status(403).json({ error: 'You are not the owner of this solo session' });
      return;
    }

    if (!isSolo && !participantId) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    let isMatch = false;

    if (isSolo) {
      if (direction === 'right') {
        await prisma.match.upsert({
          where: { sessionId_movieId: { sessionId, movieId } },
          update: {},
          create: { sessionId, movieId },
        });
        isMatch = true;
      }
    } else {
      await prisma.sessionSwipe.upsert({
        where: {
          sessionId_movieId_participantId: { sessionId, movieId, participantId: participantId! },
        },
        update: { direction, swipedAt: new Date() },
        create: { sessionId, movieId, participantId: participantId!, direction },
      });

      if (direction === 'right') {
        const [rightCount, activeCount] = await Promise.all([
          prisma.sessionSwipe.count({
            where: { sessionId, movieId, direction: 'right' },
          }),
          countActiveParticipants(sessionId),
        ]);
        if (rightCount >= activeCount && activeCount > 0) {
          await prisma.match.upsert({
            where: { sessionId_movieId: { sessionId, movieId } },
            update: {},
            create: { sessionId, movieId },
          });
          isMatch = true;
        }
      }
    }

    let swiped = 0;
    const total = await prisma.sessionMovie.count({ where: { sessionId } });
    if (isSolo) {
      await prisma.sessionMovie.update({
        where: { sessionId_movieId: { sessionId, movieId } },
        data: { user1Swipe: direction },
      });
      swiped = await prisma.sessionMovie.count({
        where: { sessionId, user1Swipe: { not: null } },
      });
    } else {
      swiped = await prisma.sessionSwipe.count({
        where: { sessionId, participantId: participantId! },
      });
    }
    const progress = total > 0 ? Math.round((swiped / total) * 100) : 0;

    emit(`session:${sessionId}`, 'swipe-update', {
      movieId,
      isMatch,
      progress,
      swiped,
      total,
      participantId,
    });

    res.json({ success: true, isMatch });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/undo', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, movieId } = req.body;

    if (!sessionId || !movieId) {
      res.status(400).json({ error: 'sessionId and movieId are required' });
      return;
    }

    const session = await prisma.swipeSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status === 'completed') {
      res.status(400).json({ error: 'Cannot undo a completed session' });
      return;
    }

    const { isSolo, isUser1, participantId } = await resolveSessionRole(req, session);

    if (isSolo && !isUser1) {
      res.status(403).json({ error: 'You are not the owner of this solo session' });
      return;
    }

    if (!isSolo && !participantId) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    if (isSolo) {
      const sm = await prisma.sessionMovie.findUnique({
        where: { sessionId_movieId: { sessionId, movieId } },
      });
      if (!sm) {
        res.status(404).json({ error: 'Movie not found in session' });
        return;
      }
      const wasRight = sm.user1Swipe === 'right';
      await prisma.sessionMovie.update({
        where: { sessionId_movieId: { sessionId, movieId } },
        data: { user1Swipe: null },
      });
      if (wasRight) {
        await prisma.match.deleteMany({ where: { sessionId, movieId } });
      }
    } else {
      const existing = await prisma.sessionSwipe.findUnique({
        where: {
          sessionId_movieId_participantId: { sessionId, movieId, participantId: participantId! },
        },
      });
      if (!existing) {
        res.status(404).json({ error: 'No swipe to undo' });
        return;
      }
      await prisma.sessionSwipe.delete({
        where: {
          sessionId_movieId_participantId: { sessionId, movieId, participantId: participantId! },
        },
      });
      // If this movie had a match, it's no longer valid (someone just un-right-swiped).
      if (existing.direction === 'right') {
        await prisma.match.deleteMany({ where: { sessionId, movieId } });
      }
    }

    let swiped = 0;
    let total = await prisma.sessionMovie.count({ where: { sessionId } });
    if (isSolo) {
      swiped = await prisma.sessionMovie.count({
        where: { sessionId, user1Swipe: { not: null } },
      });
    } else {
      swiped = await prisma.sessionSwipe.count({
        where: { sessionId, participantId: participantId! },
      });
    }
    const progress = total > 0 ? Math.round((swiped / total) * 100) : 0;

    emit(`session:${sessionId}`, 'swipe-update', {
      movieId,
      isMatch: false,
      progress,
      swiped,
      total,
      participantId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/done', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.body;

    const session = await prisma.swipeSession.findUnique({
      where: { id: sessionId },
      include: { movies: true, participants: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { isSolo, isUser1, participantId } = await resolveSessionRole(req, session);

    if (isSolo && !isUser1) {
      res.status(403).json({ error: 'You are not the owner of this solo session' });
      return;
    }

    if (!isSolo && !participantId) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    const totalMovies = session.movies.length;

    let allSwiped = false;
    let everyoneDone = false;

    if (isSolo) {
      allSwiped = (session.movies as { user1Swipe: string | null }[]).every(
        (m) => m.user1Swipe !== null,
      );
      everyoneDone = allSwiped;
    } else {
      const mySwipes = await prisma.sessionSwipe.count({
        where: { sessionId, participantId: participantId! },
      });
      allSwiped = mySwipes >= totalMovies;

      const swipeCounts = await prisma.sessionSwipe.groupBy({
        by: ['participantId'],
        where: { sessionId },
        _count: { _all: true },
      });
      const activeParticipants = session.participants.filter((p) => p.leftAt === null);
      everyoneDone = activeParticipants.every((p) => {
        const row = swipeCounts.find((r) => r.participantId === p.id);
        return row?._count._all === totalMovies;
      });
    }

    if (allSwiped && everyoneDone) {
      await prisma.swipeSession.update({
        where: { id: sessionId },
        data: { status: 'completed' },
      });

      const [rawMatches, inCinemaSet] = await Promise.all([
        prisma.match.findMany({
          where: { sessionId },
          include: { movie: true },
          orderBy: { id: 'asc' },
        }),
        getInCinemaIds(),
      ]);
      const matches = rawMatches.map((m) => ({ ...m, movie: attachInCinema(m.movie, inCinemaSet) }));

      const compromises = (!isSolo && matches.length === 0)
        ? await getCompromises(sessionId)
        : [];

      emit(`session:${sessionId}`, 'session-complete', { matches, compromises });
      clearSessionState(sessionId);

      res.json({ status: 'completed', matches, compromises });
    } else {
      await prisma.swipeSession.update({
        where: { id: sessionId },
        data: { status: 'swiping' },
      });

      emit(`session:${sessionId}`, 'partner-done', {
        finishedByRole: isUser1 ? 'user1' : 'user2',
        participantId,
      });

      res.json({ status: 'waiting', userDone: allSwiped, partnerDone: everyoneDone });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/matches/:sessionId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sid = req.params.sessionId as string;

    const session = await prisma.swipeSession.findUnique({
      where: { id: sid },
      include: { participants: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { isSolo, isUser1, isUser2 } = await resolveSessionRole(req, session);

    if (isSolo) {
      if (!isUser1) {
        res.status(403).json({ error: 'You are not part of this session' });
        return;
      }
    } else if (!isUser1 && !isUser2) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    const [rawMatches, inCinemaSet] = await Promise.all([
      prisma.match.findMany({
        where: { sessionId: sid },
        include: { movie: true },
        orderBy: { id: 'asc' },
      }),
      getInCinemaIds(),
    ]);
    const matches = rawMatches.map((m) => ({ ...m, movie: attachInCinema(m.movie, inCinemaSet) }));

    const compromises = (!isSolo && matches.length === 0)
      ? await getCompromises(sid)
      : [];

    res.json({ matches, compromises });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/matches/:matchId/watched', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const matchId = req.params.matchId as string;

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { session: { include: { participants: true } } },
    });

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const { isSolo, isUser1, isUser2 } = await resolveSessionRole(req, match.session);

    if (isSolo) {
      if (!isUser1) {
        res.status(403).json({ error: 'Not authorized' });
        return;
      }
    } else if (!isUser1 && !isUser2) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    const [updated, inCinemaSet] = await Promise.all([
      prisma.match.update({
        where: { id: matchId },
        data: { watched: true, watchedAt: new Date() },
        include: { movie: true },
      }),
      getInCinemaIds(),
    ]);

    res.json({ match: { ...updated, movie: attachInCinema(updated.movie, inCinemaSet) } });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/matches/:matchId/rate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const matchId = req.params.matchId as string;
    const { rating } = req.body;

    if (typeof rating !== 'number' || rating < 0 || rating > 10) {
      res.status(400).json({ error: 'Rating must be a number between 0 and 10' });
      return;
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { session: { include: { participants: true } } },
    });

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const { isSolo, isUser1, isUser2 } = await resolveSessionRole(req, match.session);

    if (isSolo) {
      if (!isUser1) {
        res.status(403).json({ error: 'Not authorized' });
        return;
      }
    } else if (!isUser1 && !isUser2) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    const updateField = isUser1 ? 'user1Rating' as const : 'user2Rating' as const;
    const [updated, inCinemaSet] = await Promise.all([
      prisma.match.update({
        where: { id: matchId },
        data: { [updateField]: rating },
        include: { movie: true },
      }),
      getInCinemaIds(),
    ]);

    res.json({ match: { ...updated, movie: attachInCinema(updated.movie, inCinemaSet) } });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
