import express from 'express';
import cors from 'cors';
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
import friendsRoutes from './routes/friends';

export const prisma = process.env.NODE_ENV === 'test'
  ? ({} as unknown as PrismaClient)
  : new PrismaClient();

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors({ origin: CLIENT_URL, maxAge: 86400 }));
app.use(express.json());

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
app.use('/api/friends', friendsRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
