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

const TOKEN_SECRET = process.env.JWT_SECRET || 'fallback-secret';

function makeToken(userId: string): string {
  return jwt.sign({ userId }, TOKEN_SECRET);
}

describe('Couple Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/couples/create', () => {
    it('should create a couple with invite code', async () => {
      const token = makeToken('user-1');
      mockPrisma.couple.findFirst.mockResolvedValue(null);
      mockPrisma.couple.create.mockResolvedValue({
        id: 'couple-1',
        user1Id: 'user-1',
        user2Id: null,
        inviteCode: 'ABCD1234',
      });

      const res = await request(app)
        .post('/api/couples/create')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.couple.inviteCode).toBeDefined();
      expect(res.body.couple.user1Id).toBe('user-1');
    });

    it('should return 409 if already in a couple', async () => {
      const token = makeToken('user-1');
      mockPrisma.couple.findFirst.mockResolvedValue({
        id: 'existing-couple',
        user1Id: 'user-1',
      });

      const res = await request(app)
        .post('/api/couples/create')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('You are already in a couple');
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).post('/api/couples/create');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/couples/join', () => {
    it('should join a couple with valid invite code', async () => {
      const token = makeToken('user-2');
      mockPrisma.couple.findUnique.mockResolvedValue({
        id: 'couple-1',
        user1Id: 'user-1',
        user2Id: null,
        inviteCode: 'ABCD1234',
      });
      mockPrisma.couple.update.mockResolvedValue({
        id: 'couple-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
        inviteCode: 'ABCD1234',
        user1: { id: 'user-1', displayName: 'User 1' },
        user2: { id: 'user-2', displayName: 'User 2' },
      });

      const res = await request(app)
        .post('/api/couples/join')
        .set('Authorization', `Bearer ${token}`)
        .send({ inviteCode: 'ABCD1234' });

      expect(res.status).toBe(200);
      expect(res.body.couple.user2Id).toBe('user-2');
    });

    it('should return 404 for invalid invite code', async () => {
      const token = makeToken('user-2');
      mockPrisma.couple.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/couples/join')
        .set('Authorization', `Bearer ${token}`)
        .send({ inviteCode: 'INVALID' });

      expect(res.status).toBe(404);
    });

    it('should return 409 if couple already full', async () => {
      const token = makeToken('user-3');
      mockPrisma.couple.findUnique.mockResolvedValue({
        id: 'couple-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
        inviteCode: 'ABCD1234',
      });

      const res = await request(app)
        .post('/api/couples/join')
        .set('Authorization', `Bearer ${token}`)
        .send({ inviteCode: 'ABCD1234' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('This couple already has two members');
    });

    it('should return 400 if trying to join own couple', async () => {
      const token = makeToken('user-1');
      mockPrisma.couple.findUnique.mockResolvedValue({
        id: 'couple-1',
        user1Id: 'user-1',
        user2Id: null,
        inviteCode: 'ABCD1234',
      });

      const res = await request(app)
        .post('/api/couples/join')
        .set('Authorization', `Bearer ${token}`)
        .send({ inviteCode: 'ABCD1234' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('You cannot join your own couple');
    });

    it('should return 400 if no invite code provided', async () => {
      const token = makeToken('user-2');

      const res = await request(app)
        .post('/api/couples/join')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/couples/me', () => {
    it('should return couple info', async () => {
      const token = makeToken('user-1');
      mockPrisma.couple.findFirst.mockResolvedValue({
        id: 'couple-1',
        user1: { id: 'user-1', displayName: 'User 1', avatarUrl: null },
        user2: { id: 'user-2', displayName: 'User 2', avatarUrl: null },
      });

      const res = await request(app)
        .get('/api/couples/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.couple.user1.displayName).toBe('User 1');
    });

    it('should return 404 if not in a couple', async () => {
      const token = makeToken('user-solo');
      mockPrisma.couple.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/couples/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
