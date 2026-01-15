import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emit } from '../services/emitter';

const router = Router();

function generateInviteCode(): string {
  return uuidv4().slice(0, 8).toUpperCase();
}

router.post('/create', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const existingCouple = await prisma.couple.findFirst({
      where: {
        OR: [
          { user1Id: req.userId! },
          { user2Id: req.userId! },
        ],
      },
    });

    if (existingCouple) {
      res.status(409).json({ error: 'You are already in a couple', couple: existingCouple });
      return;
    }

    const couple = await prisma.couple.create({
      data: {
        user1Id: req.userId!,
        inviteCode: generateInviteCode(),
      },
    });

    res.status(201).json({ couple });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/join', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      res.status(400).json({ error: 'Invite code is required' });
      return;
    }

    const couple = await prisma.couple.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
    });

    if (!couple) {
      res.status(404).json({ error: 'Invalid invite code' });
      return;
    }

    if (couple.user2Id) {
      res.status(409).json({ error: 'This couple already has two members' });
      return;
    }

    if (couple.user1Id === req.userId) {
      res.status(400).json({ error: 'You cannot join your own couple' });
      return;
    }

    const updated = await prisma.couple.update({
      where: { id: couple.id },
      data: { user2Id: req.userId! },
      include: {
        user1: { select: { id: true, displayName: true } },
        user2: { select: { id: true, displayName: true } },
      },
    });

    emit(`couple:${couple.id}`, 'partner-joined', { couple: updated });

    res.json({ couple: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const couple = await prisma.couple.findFirst({
      where: {
        OR: [
          { user1Id: req.userId! },
          { user2Id: req.userId! },
        ],
      },
      include: {
        user1: { select: { id: true, displayName: true, avatarUrl: true } },
        user2: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    if (!couple) {
      res.status(404).json({ error: 'Not in a couple yet' });
      return;
    }

    res.json({ couple });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/leave', authenticate, async (req: AuthRequest, res: Response) => {
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

    const isUser1 = couple.user1Id === req.userId;

    if (!couple.user2Id) {
      await prisma.couple.delete({ where: { id: couple.id } });
    } else if (isUser1) {
      await prisma.couple.update({
        where: { id: couple.id },
        data: {
          user1Id: couple.user2Id,
          user2Id: null,
          inviteCode: uuidv4().slice(0, 8).toUpperCase(),
        },
      });
      emit(`couple:${couple.id}`, 'partner-left', {});
    } else {
      await prisma.couple.update({
        where: { id: couple.id },
        data: { user2Id: null },
      });
      emit(`couple:${couple.id}`, 'partner-left', {});
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
