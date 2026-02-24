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

describe('Session Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/sessions/create', () => {
    it('should create a session from combined watchlists', async () => {
      const token = makeToken('user-1');

      mockPrisma.couple.findFirst.mockResolvedValue({
        id: 'couple-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
      });

      mockPrisma.userMovie.findMany.mockResolvedValue([
        { movieId: 'movie-1', movie: { id: 'movie-1', title: 'Film A', genres: ['Drama'], year: 2020, tmdbRating: 7.5, runtime: 120 } },
        { movieId: 'movie-2', movie: { id: 'movie-2', title: 'Film B', genres: ['Comedy'], year: 2019, tmdbRating: 6.0, runtime: 90 } },
        { movieId: 'movie-1', movie: { id: 'movie-1', title: 'Film A', genres: ['Drama'], year: 2020, tmdbRating: 7.5, runtime: 120 } },
      ]);

      mockPrisma.swipeSession.create.mockResolvedValue({
        id: 'session-1',
        coupleId: 'couple-1',
        status: 'active',
        filters: {},
      });

      mockPrisma.sessionMovie.createMany.mockResolvedValue({ count: 2 });

      mockPrisma.swipeSession.findUnique.mockResolvedValue({
        id: 'session-1',
        coupleId: 'couple-1',
        status: 'active',
        filters: {},
        movies: [
          { id: 'sm-1', movieId: 'movie-1', movie: { id: 'movie-1', title: 'Film A' } },
          { id: 'sm-2', movieId: 'movie-2', movie: { id: 'movie-2', title: 'Film B' } },
        ],
      });

      const res = await request(app)
        .post('/api/sessions/create')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.session.movies).toHaveLength(2);
    });

    it('should return 400 if couple is incomplete', async () => {
      const token = makeToken('user-1');

      mockPrisma.couple.findFirst.mockResolvedValue({
        id: 'couple-1',
        user1Id: 'user-1',
        user2Id: null,
      });

      const res = await request(app)
        .post('/api/sessions/create')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('complete couple');
    });

    it('should apply genre filters', async () => {
      const token = makeToken('user-1');

      mockPrisma.couple.findFirst.mockResolvedValue({
        id: 'couple-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
      });

      mockPrisma.userMovie.findMany.mockResolvedValue([
        { movieId: 'movie-1', movie: { id: 'movie-1', title: 'Film A', genres: ['Drama'], year: 2020, tmdbRating: 7.5, runtime: 120 } },
        { movieId: 'movie-2', movie: { id: 'movie-2', title: 'Film B', genres: ['Comedy'], year: 2019, tmdbRating: 6.0, runtime: 90 } },
      ]);

      mockPrisma.swipeSession.create.mockResolvedValue({
        id: 'session-1',
        coupleId: 'couple-1',
        status: 'active',
        filters: { genres: ['Drama'] },
      });

      mockPrisma.sessionMovie.createMany.mockResolvedValue({ count: 1 });

      mockPrisma.swipeSession.findUnique.mockResolvedValue({
        id: 'session-1',
        movies: [{ id: 'sm-1', movieId: 'movie-1', movie: { id: 'movie-1', title: 'Film A' } }],
      });

      const res = await request(app)
        .post('/api/sessions/create')
        .set('Authorization', `Bearer ${token}`)
        .send({ filters: { genres: ['Drama'] } });

      expect(res.status).toBe(201);
      // Only Drama movie should be in the pool
      expect(mockPrisma.sessionMovie.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ movieId: 'movie-1' })],
      });
    });
  });

  describe('GET /api/sessions/active', () => {
    it('should return active session', async () => {
      const token = makeToken('user-1');

      mockPrisma.couple.findFirst.mockResolvedValue({
        id: 'couple-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
      });

      mockPrisma.swipeSession.findFirst.mockResolvedValue({
        id: 'session-1',
        status: 'active',
        movies: [],
        matches: [],
      });

      const res = await request(app)
        .get('/api/sessions/active')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.session.id).toBe('session-1');
      expect(res.body.isUser1).toBe(true);
    });

    it('should return 404 if no active session', async () => {
      const token = makeToken('user-1');

      mockPrisma.couple.findFirst.mockResolvedValue({
        id: 'couple-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
      });

      mockPrisma.swipeSession.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/sessions/active')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
