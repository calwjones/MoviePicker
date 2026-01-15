import { Router, Response } from 'express';
import { prisma } from '../app';
import { emit } from '../services/emitter';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, movieId, direction } = req.body;

    if (!sessionId || !movieId || !['left', 'right'].includes(direction)) {
      res.status(400).json({ error: 'sessionId, movieId, and direction (left/right) are required' });
      return;
    }

    const session = await prisma.swipeSession.findUnique({
      where: { id: sessionId },
      include: { couple: true, movies: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const isUser1 = session.couple.user1Id === req.userId;
    const isUser2 = session.couple.user2Id === req.userId;

    if (!isUser1 && !isUser2) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    const updateField = isUser1 ? 'user1Swipe' : 'user2Swipe';
    const sessionMovie = await prisma.sessionMovie.update({
      where: {
        sessionId_movieId: { sessionId, movieId },
      },
      data: { [updateField]: direction },
    });

    const updated = await prisma.sessionMovie.findUnique({
      where: { id: sessionMovie.id },
    });

    let isMatch = false;
    if (updated?.user1Swipe === 'right' && updated?.user2Swipe === 'right') {
      await prisma.match.upsert({
        where: {
          sessionId_movieId: { sessionId, movieId },
        },
        update: {},
        create: {
          sessionId,
          movieId,
        },
      });
      isMatch = true;
    }

    const swipeField = isUser1 ? 'user1Swipe' : 'user2Swipe';
    const swiped = session.movies.filter((m) => m[swipeField] !== null).length + 1;
    const total = session.movies.length;
    const progress = Math.round((swiped / total) * 100);

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

    const isUser1 = session.couple.user1Id === req.userId;

    const swipeField = isUser1 ? 'user1Swipe' : 'user2Swipe';
    const allSwiped = session.movies.every((m) => m[swipeField] !== null);

    const otherField = isUser1 ? 'user2Swipe' : 'user1Swipe';
    const partnerDone = session.movies.every((m) => m[otherField] !== null);

    if (allSwiped && partnerDone) {
      await prisma.swipeSession.update({
        where: { id: sessionId },
        data: { status: 'completed' },
      });

      const matches = await prisma.match.findMany({
        where: { sessionId },
        include: { movie: true },
      });

      emit(`session:${sessionId}`, 'session-complete', { matches });

      res.json({ status: 'completed', matches });
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

    if (session.couple.user1Id !== req.userId && session.couple.user2Id !== req.userId) {
      res.status(403).json({ error: 'You are not part of this session' });
      return;
    }

    const matches = await prisma.match.findMany({
      where: { sessionId: sid },
      include: { movie: true },
    });

    res.json({ matches });
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

    if (match.session.couple.user1Id !== req.userId && match.session.couple.user2Id !== req.userId) {
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

    const isUser1 = match.session.couple.user1Id === req.userId;
    const isUser2 = match.session.couple.user2Id === req.userId;

    if (!isUser1 && !isUser2) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    const updateField = isUser1 ? 'user1Rating' : 'user2Rating';
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
