import { randomBytes } from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { JWT_SECRET } from '../config';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendVerificationEmail, sendPasswordResetEmail, sendRegistrationAttemptEmail } from '../services/email';

const router = Router();

// Prevent caches/proxies from storing auth responses (tokens, verification
// status, password-reset artifacts). Applied to every route in this router.
router.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  next();
});

const buildLimiter = (windowMs: number, max: number) =>
  rateLimit({
    windowMs,
    max,
    message: { error: 'Too many attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });

const HOUR = 60 * 60 * 1000;
const QUARTER_HOUR = 15 * 60 * 1000;

const registerLimiter = buildLimiter(HOUR, 5);
const loginLimiter = buildLimiter(QUARTER_HOUR, 10);
const forgotLimiter = buildLimiter(HOUR, 5);
const resetLimiter = buildLimiter(HOUR, 10);
const resendVerificationLimiter = buildLimiter(HOUR, 5);
const verifyLimiter = buildLimiter(QUARTER_HOUR, 20);
const changePasswordLimiter = buildLimiter(QUARTER_HOUR, 10);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomToken(): string {
  return randomBytes(32).toString('hex');
}

// Computed once at boot to equalize login response time when the email
// doesn't match a user — prevents timing-based account enumeration.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(24).toString('hex'), 12);

interface RegistrationInput {
  email: string;
  password: string;
  displayName: string;
}

function parseRegistrationInput(body: unknown): { value: RegistrationInput } | { error: string } {
  const { email, password, displayName } = (body ?? {}) as Partial<RegistrationInput>;
  if (!email || !password || !displayName) {
    return { error: 'Email, password, and display name are required' };
  }
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmedEmail)) {
    return { error: 'Please enter a valid email address' };
  }
  if (typeof password !== 'string' || password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }
  const trimmedName = displayName.trim();
  if (trimmedName.length < 1 || trimmedName.length > 50) {
    return { error: 'Display name must be 1-50 characters' };
  }
  return { value: { email: trimmedEmail, password, displayName: trimmedName } };
}

// Public register: always returns the same generic response whether the email
// is available or already taken, to prevent account enumeration. Users must
// verify via email before they can sign in.
router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  const parsed = parseRegistrationInput(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { email, password, displayName } = parsed.value;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      sendRegistrationAttemptEmail(email).catch((err) => {
        console.error('[auth] registration-attempt email failed:', err);
      });
    } else {
      const passwordHash = await bcrypt.hash(password, 12);
      const verificationToken = randomToken();
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          emailVerificationToken: verificationToken,
        },
      });
      sendVerificationEmail(user.email, verificationToken).catch((err) => {
        console.error('[auth] verification email failed:', err);
      });
    }

    res.status(200).json({
      message: 'If your email is available, check your inbox to verify your account.',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Guest-to-user conversion: authenticated with a guest JWT, preserves the
// active swipe session by returning a real token. Because the caller proves
// they hold a valid guest token, the enumeration concern doesn't apply the
// same way, but the response still doesn't distinguish "taken" from other
// errors in a way an unauthenticated attacker could poll.
router.post('/convert-guest', authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.isGuest) {
    res.status(403).json({ error: 'Only guest sessions can be converted' });
    return;
  }

  const parsed = parseRegistrationInput(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { email, password, displayName } = parsed.value;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = randomToken();
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
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

router.get('/verify', verifyLimiter, async (req: Request, res: Response) => {
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

router.post('/resend-verification', resendVerificationLimiter, async (req: Request, res: Response) => {
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

router.post('/forgot-password', forgotLimiter, async (req: Request, res: Response) => {
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

router.post('/reset-password', resetLimiter, async (req: Request, res: Response) => {
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

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    // Always run bcrypt.compare so response time doesn't leak user existence.
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
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

router.post('/change-password', changePasswordLimiter, authenticate, async (req: AuthRequest, res: Response) => {
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
  letterboxdUsername: true,
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
