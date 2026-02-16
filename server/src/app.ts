import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { CLIENT_URL } from './config';

import authRoutes from './routes/auth';
import coupleRoutes from './routes/couples';
import movieRoutes from './routes/movies';
import importRoutes from './routes/import';
import sessionRoutes from './routes/sessions';
import swipeRoutes from './routes/swipes';

export const prisma = new PrismaClient();

const app = express();

app.use(helmet());
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/couples', coupleRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/import', importRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/swipes', swipeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
