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
  register: (email: string, password: string, username: string) =>
    api.post('/auth/register', { email, password, username }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  updateProfile: (username: string, currentPassword: string) =>
    api.patch('/auth/me', { username, currentPassword }),
  updatePreferredProviders: (preferredStreamingProviderIds: number[]) =>
    api.patch('/auth/me', { preferredStreamingProviderIds }),
  checkUsername: (username: string) =>
    api.get<{ available: boolean; reason?: string; normalized?: string }>('/auth/username-available', { params: { u: username } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  verifyEmail: (token: string) => api.get('/auth/verify', { params: { token } }),
  resendVerification: (email: string) => api.post('/auth/resend-verification', { email }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
  deleteAccount: (currentPassword: string) =>
    api.delete('/auth/me', { data: { currentPassword } }),
  convertGuest: (email: string, password: string, username: string) =>
    api.post('/auth/convert-guest', { email, password, username }),
  completeOnboarding: () => api.post('/auth/complete-onboarding'),
};

export const movieApi = {
  mine: (filter?: string) => api.get('/movies/mine', { params: { filter } }),
  get: (id: string) => api.get(`/movies/${id}`),
  getByTmdbId: (tmdbId: number) => api.get(`/movies/tmdb/${tmdbId}`),
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
  letterboxd: (username: string) => api.post('/import/letterboxd', { username }),
};

export const sessionApi = {
  createGroup: (filters?: Record<string, unknown>, batchSize?: number | null) =>
    api.post('/sessions/group', { filters, batchSize }),
  joinGroup: (sessionId: string) =>
    api.post(`/sessions/${sessionId}/join`),
  startGroup: (sessionId: string) =>
    api.post(`/sessions/${sessionId}/start`),
  active: () => api.get('/sessions/active'),
  get: (id: string) => api.get(`/sessions/${id}`),
  history: () => api.get('/sessions/history/all'),
  cancel: (id: string) => api.delete(`/sessions/${id}`),
  anotherBatch: (sessionId: string) =>
    api.post(`/sessions/${sessionId}/another-batch`),
  byCode: (code: string) => api.get<{ sessionId: string }>(`/sessions/by-code/${code}`),
};

export const recommendationApi = {
  get: () => api.get('/recommendations'),
  similar: (tmdbId: number) => api.get(`/recommendations/similar/${tmdbId}`),
  dismiss: (tmdbId: number) => api.post('/recommendations/dismiss', { tmdbId }),
  undismiss: (tmdbId: number) => api.delete(`/recommendations/dismiss/${tmdbId}`),
  dismissed: () => api.get('/movies/mine', { params: { filter: 'dismissed' } }),
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
  create: (filters?: Record<string, unknown>, batchSize?: number | null) =>
    api.post('/solo/create', { filters, batchSize }),
  active: () => api.get('/solo/active'),
};

export const guestApi = {
  join: (sessionId: string, displayName: string) =>
    api.post(`/guest/join/${sessionId}`, { displayName }),
};

export const providerApi = {
  list: () => api.get('/providers'),
};

export const browseApi = {
  get: (sections?: string[]) =>
    api.get('/browse', sections && sections.length > 0
      ? { params: { sections: sections.join(',') } }
      : undefined),
};

export interface CategorySummary {
  slug: string;
  label: string;
  blurb: string;
  accent: string;
  posterUrl: string | null;
  movieCount: number;
}

export const categoriesApi = {
  list: () => api.get<{ categories: CategorySummary[] }>('/categories'),
  get: (slug: string) => api.get(`/categories/${slug}/movies`),
};

export const friendsApi = {
  list: () => api.get('/friends'),
  pending: () => api.get('/friends/pending'),
  request: (username: string) =>
    api.post('/friends/request', { username }),
  accept: (friendshipId: string) => api.post(`/friends/${friendshipId}/accept`),
  reject: (friendshipId: string) => api.post(`/friends/${friendshipId}/reject`),
  remove: (friendshipId: string) => api.delete(`/friends/${friendshipId}`),
  library: (friendId: string, filter?: 'watchlist' | 'watched' | 'all') =>
    api.get(`/friends/${friendId}/library`, {
      params: filter && filter !== 'all' ? { filter } : undefined,
    }),
  invites: () => api.get('/friends/invites'),
  acceptInvite: (inviteId: string) =>
    api.post<{ sessionId: string }>(`/friends/invites/${inviteId}/accept`),
  declineInvite: (inviteId: string) => api.post(`/friends/invites/${inviteId}/decline`),
  inviteToSession: (sessionId: string, friendIds: string[]) =>
    api.post(`/sessions/${sessionId}/invite`, { friendIds }),
};

export const popularApi = {
  allTime: () => api.get('/popular/all-time'),
};

export const discoverApi = {
  movies: (params: { genres?: string[]; minRating?: number; decade?: string; page?: number; providers?: number[] | 'none' }) =>
    api.get('/discover', {
      params: {
        ...params,
        genres: params.genres && params.genres.length > 0 ? params.genres.join(',') : undefined,
        providers: params.providers === 'none'
          ? 'none'
          : params.providers && params.providers.length > 0
            ? params.providers.join(',')
            : undefined,
      },
    }),
};

export default api;
