import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import mockPrisma from '../__mocks__/prisma';

jest.mock('../app', () => {
  const actual = jest.requireActual('../app');
  return {
    __esModule: true,
    default: actual.default,
    prisma: require('../__mocks__/prisma').default,
  };
});

jest.mock('../services/emitter', () => ({
  emit: jest.fn(),
}));

const TOKEN_SECRET = process.env.JWT_SECRET || 'fallback-secret';

function makeToken(userId: string): string {
  return jwt.sign({ userId }, TOKEN_SECRET);
}

describe('Swipe Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/swipes', () => {
    it('should record a swipe right', async () => {
      const token = makeToken('user-1');

      mockPrisma.swipeSession.findUnique.mockResolvedValue({
        id: 'session-1',
        couple: { user1Id: 'user-1', user2Id: 'user-2' },
      });

      mockPrisma.sessionMovie.update.mockResolvedValue({
        id: 'sm-1',
        user1Swipe: 'right',
        user2Swipe: null,
      });

      mockPrisma.sessionMovie.findUnique.mockResolvedValue({
        id: 'sm-1',
        user1Swipe: 'right',
        user2Swipe: null,
      });

      const res = await request(app)
        .post('/api/swipes')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'session-1', movieId: 'movie-1', direction: 'right' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isMatch).toBe(false);
    });

    it('should detect a match when both swipe right', async () => {
      const token = makeToken('user-2');

      mockPrisma.swipeSession.findUnique.mockResolvedValue({
        id: 'session-1',
        couple: { user1Id: 'user-1', user2Id: 'user-2' },
      });

      mockPrisma.sessionMovie.update.mockResolvedValue({
        id: 'sm-1',
        user1Swipe: 'right',
        user2Swipe: 'right',
      });

      mockPrisma.sessionMovie.findUnique.mockResolvedValue({
        id: 'sm-1',
        user1Swipe: 'right',
        user2Swipe: 'right',
      });

      mockPrisma.match.create.mockResolvedValue({
        id: 'match-1',
        sessionId: 'session-1',
        movieId: 'movie-1',
      });

      const res = await request(app)
        .post('/api/swipes')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'session-1', movieId: 'movie-1', direction: 'right' });

      expect(res.status).toBe(200);
      expect(res.body.isMatch).toBe(true);
      expect(mockPrisma.match.create).toHaveBeenCalledTimes(1);
    });

    it('should not match on left swipe', async () => {
      const token = makeToken('user-1');

      mockPrisma.swipeSession.findUnique.mockResolvedValue({
        id: 'session-1',
        couple: { user1Id: 'user-1', user2Id: 'user-2' },
      });

      mockPrisma.sessionMovie.update.mockResolvedValue({
        id: 'sm-1',
        user1Swipe: 'left',
        user2Swipe: null,
      });

      mockPrisma.sessionMovie.findUnique.mockResolvedValue({
        id: 'sm-1',
        user1Swipe: 'left',
        user2Swipe: null,
      });

      const res = await request(app)
        .post('/api/swipes')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'session-1', movieId: 'movie-1', direction: 'left' });

      expect(res.status).toBe(200);
      expect(res.body.isMatch).toBe(false);
      expect(mockPrisma.match.create).not.toHaveBeenCalled();
    });

    it('should return 400 with invalid direction', async () => {
      const token = makeToken('user-1');

      const res = await request(app)
        .post('/api/swipes')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'session-1', movieId: 'movie-1', direction: 'up' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent session', async () => {
      const token = makeToken('user-1');
      mockPrisma.swipeSession.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/swipes')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'fake-session', movieId: 'movie-1', direction: 'right' });

      expect(res.status).toBe(404);
    });

    it('should return 403 if user is not in the couple', async () => {
      const token = makeToken('user-3');

      mockPrisma.swipeSession.findUnique.mockResolvedValue({
        id: 'session-1',
        couple: { user1Id: 'user-1', user2Id: 'user-2' },
      });

      const res = await request(app)
        .post('/api/swipes')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'session-1', movieId: 'movie-1', direction: 'right' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/swipes/matches/:sessionId', () => {
    it('should return matches for a session', async () => {
      const token = makeToken('user-1');

      mockPrisma.match.findMany.mockResolvedValue([
        { id: 'match-1', movieId: 'movie-1', movie: { id: 'movie-1', title: 'Film A' } },
        { id: 'match-2', movieId: 'movie-2', movie: { id: 'movie-2', title: 'Film B' } },
      ]);

      const res = await request(app)
        .get('/api/swipes/matches/session-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.matches).toHaveLength(2);
    });

    it('should return empty array if no matches', async () => {
      const token = makeToken('user-1');
      mockPrisma.match.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/swipes/matches/session-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.matches).toHaveLength(0);
    });
  });
});
