import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { JWT_SECRET } from '../config';

const router = Router();

router.post('/join/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { displayName } = req.body;

    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
      res.status(400).json({ error: 'displayName is required' });
      return;
    }

    if (displayName.trim().length > 30) {
      res.status(400).json({ error: 'Display name must be 30 characters or fewer' });
      return;
    }

    const trimmedName = displayName.trim();

    const session = await prisma.swipeSession.findUnique({ where: { id: sessionId } });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status === 'completed') {
      res.status(400).json({ error: 'This session has already ended' });
      return;
    }

    const guestId = uuidv4();

    await prisma.sessionParticipant.create({
      data: {
        sessionId,
        guestToken: guestId,
        displayName: trimmedName,
        isHost: false,
      },
    });

    if (!session.guestId) {
      await prisma.swipeSession.update({
        where: { id: sessionId },
        data: { guestId, guestName: trimmedName },
      });
    }

    const token = jwt.sign(
      { guestId, sessionId, displayName: trimmedName },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, sessionId, guestId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
