import axios from 'axios';

// Mock axios
jest.mock('axios', () => {
  const mockAxios = {
    create: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
    },
    get: jest.fn(),
    post: jest.fn(),
  };
  mockAxios.create.mockReturnValue(mockAxios);
  return { default: mockAxios, __esModule: true };
});

// Need to import after mocking
import { authApi, coupleApi, movieApi, importApi, sessionApi, swipeApi } from '@/lib/api';

const mockAxiosInstance = axios.create() as jest.Mocked<ReturnType<typeof axios.create>>;

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authApi', () => {
    it('register calls POST /auth/register with correct data', async () => {
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue({ data: { user: {}, token: 'abc' } });
      await authApi.register('test@test.com', 'pass123', 'Test');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/register', {
        email: 'test@test.com',
        password: 'pass123',
        displayName: 'Test',
      });
    });

    it('login calls POST /auth/login with correct data', async () => {
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue({ data: { user: {}, token: 'abc' } });
      await authApi.login('test@test.com', 'pass123');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@test.com',
        password: 'pass123',
      });
    });

    it('me calls GET /auth/me', async () => {
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue({ data: { user: {} } });
      await authApi.me();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/me');
    });
  });

  describe('coupleApi', () => {
    it('create calls POST /couples/create', async () => {
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue({ data: {} });
      await coupleApi.create();
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/couples/create');
    });

    it('join calls POST /couples/join with invite code', async () => {
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue({ data: {} });
      await coupleApi.join('ABCD1234');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/couples/join', { inviteCode: 'ABCD1234' });
    });

    it('me calls GET /couples/me', async () => {
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue({ data: {} });
      await coupleApi.me();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/couples/me');
    });
  });

  describe('movieApi', () => {
    it('mine calls GET /movies/mine with filter param', async () => {
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue({ data: {} });
      await movieApi.mine('watchlist');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/movies/mine', { params: { filter: 'watchlist' } });
    });

    it('get calls GET /movies/:id', async () => {
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue({ data: {} });
      await movieApi.get('movie-1');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/movies/movie-1');
    });
  });

  describe('sessionApi', () => {
    it('create calls POST /sessions/create with filters', async () => {
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue({ data: {} });
      const filters = { genres: ['Drama'] };
      await sessionApi.create(filters);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/sessions/create', { filters });
    });

    it('active calls GET /sessions/active', async () => {
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue({ data: {} });
      await sessionApi.active();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/sessions/active');
    });
  });

  describe('swipeApi', () => {
    it('swipe calls POST /swipes with correct data', async () => {
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue({ data: {} });
      await swipeApi.swipe('session-1', 'movie-1', 'right');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/swipes', {
        sessionId: 'session-1',
        movieId: 'movie-1',
        direction: 'right',
      });
    });

    it('done calls POST /swipes/done', async () => {
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue({ data: {} });
      await swipeApi.done('session-1');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/swipes/done', { sessionId: 'session-1' });
    });

    it('matches calls GET /swipes/matches/:sessionId', async () => {
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue({ data: {} });
      await swipeApi.matches('session-1');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/swipes/matches/session-1');
    });
  });
});
