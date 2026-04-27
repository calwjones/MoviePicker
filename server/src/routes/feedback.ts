import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many submissions, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const MAX_BODY = 2000;
const MAX_PAGE = 200;

router.post('/', feedbackLimiter, authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.isGuest ? null : req.userId ?? null;
    const { body, page } = req.body as { body?: string; page?: string };

    const trimmed = (body ?? '').trim();
    if (!trimmed) {
      res.status(400).json({ error: 'Feedback body is required' });
      return;
    }
    if (trimmed.length > MAX_BODY) {
      res.status(400).json({ error: `Feedback too long (max ${MAX_BODY} characters)` });
      return;
    }

    const userAgent = req.headers['user-agent']?.slice(0, 500) ?? null;
    const safePage = page && typeof page === 'string' ? page.slice(0, MAX_PAGE) : null;

    await prisma.feedback.create({
      data: {
        userId,
        body: trimmed,
        page: safePage,
        userAgent,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[feedback] submit failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
