import { randomBytes } from 'crypto';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { JWT_SECRET } from '../config';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomToken(): string {
  return randomBytes(32).toString('hex');
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      res.status(400).json({ error: 'Email, password, and display name are required' });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmedEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address' });
      return;
    }

    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const trimmedName = displayName.trim();
    if (trimmedName.length < 1 || trimmedName.length > 50) {
      res.status(400).json({ error: 'Display name must be 1-50 characters' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = randomToken();
    const user = await prisma.user.create({
      data: {
        email: trimmedEmail,
        passwordHash,
        displayName: trimmedName,
        emailVerificationToken: verificationToken,
      },
    });

    sendVerificationEmail(user.email, verificationToken).catch((err) => {
      console.error('[auth] verification email failed:', err);
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        preferredStreamingProviderIds: user.preferredStreamingProviderIds,
      },
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/verify', async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }
    const user = await prisma.user.findFirst({ where: { emailVerificationToken: token } });
    if (!user) {
      res.status(400).json({ error: 'Invalid or expired verification link' });
      return;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationToken: null },
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (user && !user.emailVerified) {
      const token = user.emailVerificationToken || randomToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationToken: token },
      });
      sendVerificationEmail(user.email, token).catch((err) => {
        console.error('[auth] resend verification email failed:', err);
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (user) {
      const token = randomToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: token, passwordResetExpiresAt: expiresAt },
      });
      sendPasswordResetEmail(user.email, token).catch((err) => {
        console.error('[auth] reset email failed:', err);
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    const user = await prisma.user.findFirst({ where: { passwordResetToken: token } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      res.status(400).json({ error: 'Invalid or expired reset link' });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({ error: 'Please verify your email before signing in', code: 'email_unverified' });
      return;
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        preferredStreamingProviderIds: user.preferredStreamingProviderIds,
      },
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  emailVerified: true,
  preferredStreamingProviderIds: true,
} as const;

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: USER_SELECT,
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { displayName, preferredStreamingProviderIds } = req.body;
    const data: { displayName?: string; preferredStreamingProviderIds?: number[] } = {};

    if (displayName !== undefined) {
      if (typeof displayName !== 'string') {
        res.status(400).json({ error: 'Display name must be a string' });
        return;
      }
      const trimmed = displayName.trim();
      if (trimmed.length < 1 || trimmed.length > 50) {
        res.status(400).json({ error: 'Display name must be 1-50 characters' });
        return;
      }
      data.displayName = trimmed;
    }

    if (preferredStreamingProviderIds !== undefined) {
      if (!Array.isArray(preferredStreamingProviderIds) || !preferredStreamingProviderIds.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        res.status(400).json({ error: 'preferredStreamingProviderIds must be an array of numbers' });
        return;
      }
      data.preferredStreamingProviderIds = preferredStreamingProviderIds.map((n) => Math.trunc(n));
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: USER_SELECT,
    });
    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword } = req.body;
    if (!currentPassword) {
      res.status(400).json({ error: 'Current password is required to delete your account' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }
    await prisma.user.delete({ where: { id: user.id } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
