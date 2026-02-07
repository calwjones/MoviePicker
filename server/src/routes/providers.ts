import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getAvailableProviders } from '../services/tmdb';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const providers = await getAvailableProviders('GB');
    res.json({ providers });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
