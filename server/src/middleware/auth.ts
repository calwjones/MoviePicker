import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';

export interface AuthRequest extends Request {
  userId?: string;
  isGuest?: boolean;
  guestId?: string;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string; guestId?: string };
    if (decoded.guestId) {
      req.isGuest = true;
      req.guestId = decoded.guestId;
      req.userId = 'guest';
    } else {
      req.isGuest = false;
      req.userId = decoded.userId;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/** For account-only routes: guest tokens (from share links) get a clean 403. */
export function requireUser(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.isGuest || !req.userId) {
    res.status(403).json({ error: 'Sign in to do that', code: 'account_required' });
    return;
  }
  next();
}

export const authenticateUser = [authenticate, requireUser];
