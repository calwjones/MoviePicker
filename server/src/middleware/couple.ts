import { Response, NextFunction } from 'express';
import { prisma } from '../app';
import { AuthRequest } from './auth';

export async function requireCouple(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

  req.couple = couple;
  req.isUser1 = couple.user1Id === req.userId;
  next();
}

export async function requireFullCouple(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

  if (!couple.user2Id) {
    res.status(400).json({ error: 'You need to be in a complete couple to start a session' });
    return;
  }

  req.couple = couple;
  req.isUser1 = couple.user1Id === req.userId;
  next();
}
