import { Router, Response } from 'express';
import { prisma } from '../app';
import { emit } from '../services/emitter';
import { authenticate, AuthRequest } from '../middleware/auth';
import { resolveSessionRole } from '../lib/resolveSessionRole';

const router = Router();

async function getCompromises(sessionId: string) {
  const oneSided = await prisma.sessionMovie.findMany({
    where: {
      sessionId,
      OR: [
        { user1Swipe: 'right', user2Swipe: 'left' },
        { user1Swipe: 'left', user2Swipe: 'right' },
      ],
    },
    include: { movie: true },
    orderBy: { movie: { tmdbRating: 'desc' } },
    take: 3,
  });
  return oneSided.map((sm) => ({
    id: sm.id,
    movieId: sm.movieId,
    movie: sm.movie,
  }));
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
      include: { couple: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { isSolo, isUser1, isUser2 } = resolveSessionRole(req, session);

    if (isSolo && !isUser1) {
      res.status(403).json({ error: 'You are not the owner of this solo session' });
      return;
    }

    if (!isSolo && !isUser1 && !isUser2) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    const swipeField = isUser1 ? 'user1Swipe' as const : 'user2Swipe' as const;
    const sessionMovie = await prisma.sessionMovie.update({
      where: {
        sessionId_movieId: { sessionId, movieId },
      },
      data: { [swipeField]: direction },
    });

    const updated = await prisma.sessionMovie.findUnique({
      where: { id: sessionMovie.id },
    });

    let isMatch = false;
    if (isSolo && direction === 'right') {
      await prisma.match.upsert({
        where: { sessionId_movieId: { sessionId, movieId } },
        update: {},
        create: { sessionId, movieId },
      });
      isMatch = true;
    } else if (!isSolo && updated?.user1Swipe === 'right' && updated?.user2Swipe === 'right') {
      await prisma.match.upsert({
        where: { sessionId_movieId: { sessionId, movieId } },
        update: {},
        create: { sessionId, movieId },
      });
      isMatch = true;
    }

    const countWhere = isUser1
      ? { sessionId, user1Swipe: { not: null } }
      : { sessionId, user2Swipe: { not: null } };
    const swiped = await prisma.sessionMovie.count({ where: countWhere });
    const total = await prisma.sessionMovie.count({ where: { sessionId } });
    const progress = total > 0 ? Math.round((swiped / total) * 100) : 0;

    emit(`session:${sessionId}`, 'swipe-update', {
      movieId,
      isMatch,
      progress,
      swiped,
      total,
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
      include: { couple: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status === 'completed') {
      res.status(400).json({ error: 'Cannot undo a completed session' });
      return;
    }

    const { isSolo, isUser1, isUser2 } = resolveSessionRole(req, session);

    if (isSolo && !isUser1) {
      res.status(403).json({ error: 'You are not the owner of this solo session' });
      return;
    }

    if (!isSolo && !isUser1 && !isUser2) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    const swipeField = isUser1 ? 'user1Swipe' as const : 'user2Swipe' as const;

    const sessionMovie = await prisma.sessionMovie.findUnique({
      where: { sessionId_movieId: { sessionId, movieId } },
    });

    if (!sessionMovie) {
      res.status(404).json({ error: 'Movie not found in session' });
      return;
    }

    const wasRight = sessionMovie[swipeField] === 'right';

    await prisma.sessionMovie.update({
      where: { sessionId_movieId: { sessionId, movieId } },
      data: { [swipeField]: null },
    });

    if (wasRight) {
      await prisma.match.deleteMany({ where: { sessionId, movieId } });
    }

    const countWhere = isUser1
      ? { sessionId, user1Swipe: { not: null } }
      : { sessionId, user2Swipe: { not: null } };
    const swiped = await prisma.sessionMovie.count({ where: countWhere });
    const total = await prisma.sessionMovie.count({ where: { sessionId } });
    const progress = total > 0 ? Math.round((swiped / total) * 100) : 0;

    emit(`session:${sessionId}`, 'swipe-update', {
      movieId,
      isMatch: false,
      progress,
      swiped,
      total,
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
      include: {
        couple: true,
        movies: true,
      },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { isSolo, isUser1, isUser2 } = resolveSessionRole(req, session);

    if (isSolo && !isUser1) {
      res.status(403).json({ error: 'You are not the owner of this solo session' });
      return;
    }

    if (!isSolo && !isUser1 && !isUser2) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    const swipeField = isUser1 ? 'user1Swipe' as const : 'user2Swipe' as const;
    const allSwiped = (session.movies as { user1Swipe: string | null; user2Swipe: string | null }[]).every((m) => m[swipeField] !== null);

    const otherField = isUser1 ? 'user2Swipe' as const : 'user1Swipe' as const;
    const partnerDone = isSolo ? true : (session.movies as { user1Swipe: string | null; user2Swipe: string | null }[]).every((m) => m[otherField] !== null);

    if (allSwiped && partnerDone) {
      await prisma.swipeSession.update({
        where: { id: sessionId },
        data: { status: 'completed' },
      });

      const matches = await prisma.match.findMany({
        where: { sessionId },
        include: { movie: true },
      });

      const compromises = (!isSolo && matches.length === 0)
        ? await getCompromises(sessionId)
        : [];

      emit(`session:${sessionId}`, 'session-complete', { matches, compromises });

      res.json({ status: 'completed', matches, compromises });
    } else {
      await prisma.swipeSession.update({
        where: { id: sessionId },
        data: { status: 'swiping' },
      });

      emit(`session:${sessionId}`, 'partner-done', { userDone: allSwiped });

      res.json({ status: 'waiting', userDone: allSwiped, partnerDone });
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
      include: { couple: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { isSolo, isUser1, isUser2, isGuest } = resolveSessionRole(req, session);

    if (isSolo) {
      if (!isUser1) {
        res.status(403).json({ error: 'You are not part of this session' });
        return;
      }
    } else if (!isGuest && !isUser1 && !isUser2) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    const matches = await prisma.match.findMany({
      where: { sessionId: sid },
      include: { movie: true },
    });

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
      include: { session: { include: { couple: true } } },
    });

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const { isSolo, isUser1, isUser2 } = resolveSessionRole(req, match.session);

    if (isSolo) {
      if (!isUser1) {
        res.status(403).json({ error: 'Not authorized' });
        return;
      }
    } else if (!isUser1 && !isUser2) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    const updated = await prisma.match.update({
      where: { id: matchId },
      data: { watched: true, watchedAt: new Date() },
      include: { movie: true },
    });

    res.json({ match: updated });
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
      include: { session: { include: { couple: true } } },
    });

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const { isSolo, isUser1, isUser2 } = resolveSessionRole(req, match.session);

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
    const updated = await prisma.match.update({
      where: { id: matchId },
      data: { [updateField]: rating },
      include: { movie: true },
    });

    res.json({ match: updated });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
