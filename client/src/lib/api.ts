import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (currentPath !== '/auth' && !error.config?.url?.includes('/auth/')) {
        // If we have a backed-up user token (from before guest session), restore it
        const backup = localStorage.getItem('user_token_backup');
        if (backup) {
          localStorage.setItem('token', backup);
          localStorage.removeItem('user_token_backup');
          localStorage.removeItem('guest_session_id');
          window.location.href = '/dashboard';
          return Promise.reject(error);
        }
        localStorage.removeItem('token');
        window.location.href = '/auth?mode=login&expired=1';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (email: string, password: string, displayName: string) =>
    api.post('/auth/register', { email, password, displayName }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

export const movieApi = {
  mine: (filter?: string) => api.get('/movies/mine', { params: { filter } }),
  get: (id: string) => api.get(`/movies/${id}`),
  search: (query: string, page = 1) => api.get('/movies/search', { params: { q: query, page } }),
  add: (tmdbId: number) => api.post('/movies/add', { tmdbId }),
  removeFromWatchlist: (movieId: string) => api.delete(`/movies/${movieId}/watchlist`),
  getPoolSize: () => api.get('/movies/pool-size'),
  markWatched: (movieId: string, watched: boolean) => api.patch(`/movies/${movieId}/watched`, { watched }),
  rate: (movieId: string, rating: number | null) => api.post(`/movies/${movieId}/rate`, { rating }),
};

export const importApi = {
  watchlist: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/import/watchlist', form);
  },
  ratings: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/import/ratings', form);
  },
  watched: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/import/watched', form);
  },
};

export const sessionApi = {
  createGroup: (filters?: Record<string, unknown>) =>
    api.post('/sessions/group', { filters }),
  joinGroup: (sessionId: string) =>
    api.post(`/sessions/${sessionId}/join`),
  startGroup: (sessionId: string) =>
    api.post(`/sessions/${sessionId}/start`),
  active: () => api.get('/sessions/active'),
  get: (id: string) => api.get(`/sessions/${id}`),
  history: () => api.get('/sessions/history/all'),
  cancel: (id: string) => api.delete(`/sessions/${id}`),
};

export const recommendationApi = {
  get: () => api.get('/recommendations'),
  similar: (tmdbId: number) => api.get(`/recommendations/similar/${tmdbId}`),
};

export const swipeApi = {
  swipe: (sessionId: string, movieId: string, direction: 'left' | 'right') =>
    api.post('/swipes', { sessionId, movieId, direction }),
  undo: (sessionId: string, movieId: string) =>
    api.post('/swipes/undo', { sessionId, movieId }),
  done: (sessionId: string) => api.post('/swipes/done', { sessionId }),
  matches: (sessionId: string) => api.get(`/swipes/matches/${sessionId}`),
  markWatched: (matchId: string) => api.post(`/swipes/matches/${matchId}/watched`),
  rateMatch: (matchId: string, rating: number) =>
    api.post(`/swipes/matches/${matchId}/rate`, { rating }),
};

export const soloApi = {
  create: (filters?: Record<string, unknown>) =>
    api.post('/solo/create', { filters }),
  active: () => api.get('/solo/active'),
};

export const guestApi = {
  join: (sessionId: string, displayName: string) =>
    api.post(`/guest/join/${sessionId}`, { displayName }),
};

export const providerApi = {
  list: () => api.get('/providers'),
};

export default api;
