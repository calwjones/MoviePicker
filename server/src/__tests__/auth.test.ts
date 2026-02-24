import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import mockPrisma from '../__mocks__/prisma';

// Mock the prisma client
jest.mock('../app', () => {
  const actual = jest.requireActual('../app');
  return {
    __esModule: true,
    default: actual.default,
    prisma: require('../__mocks__/prisma').default,
  };
});

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        passwordHash: 'hashed',
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123', displayName: 'Test User' });

      expect(res.status).toBe(201);
      expect(res.body.user).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
      });
      expect(res.body.token).toBeDefined();
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('should return 400 if fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email, password, and display name are required');
    });

    it('should return 409 if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'taken@example.com', password: 'password123', displayName: 'Test' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already registered');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      const hashedPassword = await bcrypt.hash('password123', 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        passwordHash: hashedPassword,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.token).toBeDefined();
    });

    it('should return 401 with wrong password', async () => {
      const hashedPassword = await bcrypt.hash('correct-password', 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: hashedPassword,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 401 for non-existent email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 400 if fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user data with valid token', async () => {
      const token = jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET || 'fallback-secret');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        avatarUrl: null,
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe('user-1');
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });
});
