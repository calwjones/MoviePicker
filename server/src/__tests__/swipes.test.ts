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

const baseSession = {
  id: 'session-1',
  type: 'couple',
  userId: null,
  guestId: null,
  guestName: null,
  status: 'active',
  couple: { user1Id: 'user-1', user2Id: 'user-2' },
  movies: [],
};

describe('Swipe Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/swipes', () => {
    it('should record a swipe right', async () => {
      const token = makeToken('user-1');

      mockPrisma.swipeSession.findUnique.mockResolvedValue(baseSession);

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

      mockPrisma.swipeSession.findUnique.mockResolvedValue(baseSession);

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

      mockPrisma.match.upsert.mockResolvedValue({
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
      expect(mockPrisma.match.upsert).toHaveBeenCalledTimes(1);
    });

    it('should not match on left swipe', async () => {
      const token = makeToken('user-1');

      mockPrisma.swipeSession.findUnique.mockResolvedValue(baseSession);

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
      expect(mockPrisma.match.upsert).not.toHaveBeenCalled();
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

      mockPrisma.swipeSession.findUnique.mockResolvedValue(baseSession);

      const res = await request(app)
        .post('/api/swipes')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'session-1', movieId: 'movie-1', direction: 'right' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/swipes/undo', () => {
    it('should nullify a swipe', async () => {
      const token = makeToken('user-1');

      mockPrisma.swipeSession.findUnique.mockResolvedValue({ ...baseSession });

      mockPrisma.sessionMovie.findUnique.mockResolvedValue({
        id: 'sm-1',
        sessionId: 'session-1',
        movieId: 'movie-1',
        user1Swipe: 'left',
        user2Swipe: null,
      });

      mockPrisma.sessionMovie.update.mockResolvedValue({
        id: 'sm-1',
        user1Swipe: null,
        user2Swipe: null,
      });

      mockPrisma.sessionMovie.count.mockResolvedValue(0);

      const res = await request(app)
        .post('/api/swipes/undo')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'session-1', movieId: 'movie-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockPrisma.match.deleteMany).not.toHaveBeenCalled();
    });

    it('should delete match when undoing a right swipe', async () => {
      const token = makeToken('user-1');

      mockPrisma.swipeSession.findUnique.mockResolvedValue({ ...baseSession });

      mockPrisma.sessionMovie.findUnique.mockResolvedValue({
        id: 'sm-1',
        sessionId: 'session-1',
        movieId: 'movie-1',
        user1Swipe: 'right',
        user2Swipe: null,
      });

      mockPrisma.sessionMovie.update.mockResolvedValue({
        id: 'sm-1',
        user1Swipe: null,
        user2Swipe: null,
      });

      mockPrisma.match.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.sessionMovie.count.mockResolvedValue(0);

      const res = await request(app)
        .post('/api/swipes/undo')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'session-1', movieId: 'movie-1' });

      expect(res.status).toBe(200);
      expect(mockPrisma.match.deleteMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1', movieId: 'movie-1' },
      });
    });

    it('should return 400 for a completed session', async () => {
      const token = makeToken('user-1');

      mockPrisma.swipeSession.findUnique.mockResolvedValue({
        ...baseSession,
        status: 'completed',
      });

      const res = await request(app)
        .post('/api/swipes/undo')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'session-1', movieId: 'movie-1' });

      expect(res.status).toBe(400);
    });

    it('should return 403 if user is not in the session', async () => {
      const token = makeToken('user-3');

      mockPrisma.swipeSession.findUnique.mockResolvedValue({ ...baseSession });

      const res = await request(app)
        .post('/api/swipes/undo')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'session-1', movieId: 'movie-1' });

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent session', async () => {
      const token = makeToken('user-1');
      mockPrisma.swipeSession.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/swipes/undo')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: 'fake-session', movieId: 'movie-1' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/swipes/matches/:sessionId', () => {
    it('should return matches for a couple session member', async () => {
      const token = makeToken('user-1');

      mockPrisma.swipeSession.findUnique.mockResolvedValue({
        ...baseSession,
        type: 'couple',
      });

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

    it('should allow guest access to matches', async () => {
      const guestId = 'guest-uuid-1';
      const guestToken = jwt.sign({ guestId, sessionId: 'session-1', displayName: 'Alice' }, TOKEN_SECRET);

      mockPrisma.swipeSession.findUnique.mockResolvedValue({
        ...baseSession,
        type: 'couple',
        guestId,
      });

      mockPrisma.match.findMany.mockResolvedValue([
        { id: 'match-1', movieId: 'movie-1', movie: { id: 'movie-1', title: 'Film A' } },
      ]);

      const res = await request(app)
        .get('/api/swipes/matches/session-1')
        .set('Authorization', `Bearer ${guestToken}`);

      expect(res.status).toBe(200);
      expect(res.body.matches).toHaveLength(1);
    });

    it('should return empty array if no matches', async () => {
      const token = makeToken('user-1');

      mockPrisma.swipeSession.findUnique.mockResolvedValue({ ...baseSession });
      mockPrisma.match.findMany.mockResolvedValue([]);
      mockPrisma.sessionMovie.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/swipes/matches/session-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.matches).toHaveLength(0);
    });
  });
});
