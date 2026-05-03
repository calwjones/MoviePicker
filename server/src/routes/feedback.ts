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

const ADMIN_USERNAMES = new Set(
  (process.env.ADMIN_USERNAMES ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0),
);

async function isAdmin(req: AuthRequest): Promise<boolean> {
  if (req.isGuest || req.userId == null) return false;
  if (ADMIN_USERNAMES.size === 0) return false;
  const u = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { username: true },
  });
  return u != null && ADMIN_USERNAMES.has(u.username.toLowerCase());
}

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

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
    const rows = await prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const userIds = Array.from(new Set(rows.map((r) => r.userId).filter((x): x is string => !!x)));
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u.username]));
    const feedback = rows.map((r) => ({
      ...r,
      username: r.userId ? userById.get(r.userId) ?? null : null,
    }));
    res.json({ feedback });
  } catch (err) {
    console.error('[feedback] list failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
