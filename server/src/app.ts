import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { CLIENT_URL } from './config';

import authRoutes from './routes/auth';
import movieRoutes from './routes/movies';
import importRoutes from './routes/import';
import sessionRoutes from './routes/sessions';
import swipeRoutes from './routes/swipes';
import soloRoutes from './routes/solo';
import guestRoutes from './routes/guest';
import recommendationRoutes from './routes/recommendations';
import providerRoutes from './routes/providers';
import browseRoutes from './routes/browse';
import discoverRoutes from './routes/discover';
import popularRoutes from './routes/popular';
import friendsRoutes from './routes/friends';
import devicesRoutes from './routes/devices';
import categoriesRoutes from './routes/categories';
import feedbackRoutes from './routes/feedback';

export const prisma = process.env.NODE_ENV === 'test'
  ? ({} as unknown as PrismaClient)
  : new PrismaClient();

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
// Discover and library payloads run to hundreds of movies; gzip cuts them ~5x.
app.use(compression());
app.use(cors({ origin: CLIENT_URL, maxAge: 86400 }));
app.use(express.json());
// Express 5 leaves req.body undefined when a request has no body; handlers
// destructure it, so default to an empty object rather than 500 on a bare POST.
app.use((req, _res, next) => {
  if (req.body === undefined || req.body === null || typeof req.body !== 'object') req.body = {};
  next();
});

const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/import', importRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/swipes', swipeRoutes);
app.use('/api/solo', soloRoutes);
app.use('/api/guest', guestLimiter, guestRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/browse', browseRoutes);
app.use('/api/discover', discoverRoutes);
app.use('/api/popular', popularRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/feedback', feedbackRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Malformed JSON and anything a route didn't catch come back as JSON, never an
// HTML stack page.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 413 ? 'Request too large' : 'Invalid request' });
    return;
  }
  console.error('[api] unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
