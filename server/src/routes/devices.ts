import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

router.post('/register', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { expoPushToken, platform } = req.body as {
      expoPushToken?: string;
      platform?: string;
    };

    if (!expoPushToken || !EXPO_TOKEN_RE.test(expoPushToken)) {
      res.status(400).json({ error: 'Invalid expoPushToken' });
      return;
    }
    if (platform !== 'ios' && platform !== 'android') {
      res.status(400).json({ error: 'platform must be ios or android' });
      return;
    }

    await prisma.deviceToken.upsert({
      where: { expoPushToken },
      update: { userId, platform, lastActiveAt: new Date() },
      create: { userId, platform, expoPushToken },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[devices] register failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/register', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { expoPushToken } = req.body as { expoPushToken?: string };
    if (!expoPushToken) {
      res.status(400).json({ error: 'expoPushToken is required' });
      return;
    }
    await prisma.deviceToken.deleteMany({
      where: { expoPushToken, userId },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[devices] unregister failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/preferences', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const body = req.body as Record<string, unknown>;
    const allowed = ['matches', 'invites', 'friends', 'sessionStarted', 'sessionComplete'];
    const next: Record<string, boolean> = {};
    for (const key of allowed) {
      if (typeof body[key] === 'boolean') next[key] = body[key] as boolean;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });
    const merged = {
      ...((user?.notificationPreferences as Record<string, boolean>) || {}),
      ...next,
    };
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { notificationPreferences: merged },
      select: { notificationPreferences: true },
    });
    res.json({ notificationPreferences: updated.notificationPreferences });
  } catch (err) {
    console.error('[devices] preferences failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
