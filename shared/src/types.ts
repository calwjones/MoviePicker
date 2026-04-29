export interface StreamingProvider {
  name: string;
  type: string;
  logoUrl: string;
}

export interface Movie {
  id: string;
  tmdbId?: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  genres: string[];
  director: string | null;
  cast: string[];
  runtime: number | null;
  tmdbRating: number | null;
  streamingProviders: StreamingProvider[];
  inCinema?: boolean;
}

export interface UserMovie {
  id: string;
  movieId: string;
  movie: Movie;
  onWatchlist: boolean;
  watched: boolean;
  userRating: number | null;
  source: string;
  createdAt: string;
}

export interface SearchResult {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  rating: number | null;
  seedTitles?: string[];
  inCinema?: boolean;
}

export interface SessionMovie {
  id: string;
  movieId: string;
  movie: Movie;
  user1Swipe: string | null;
  user2Swipe: string | null;
  tier?: 'crossover' | 'exclusive' | null;
  sourceUserId?: string | null;
}

export interface Match {
  id: string;
  movieId: string;
  movie: Movie;
  watched: boolean;
  watchedAt: string | null;
  userRating: number | null;
}

export interface HistorySession {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  movieCount: number;
  matchCount: number;
  matches: Match[];
}

export interface Filters {
  genres: string[];
  decade: string;
  minRating: number;
  maxRuntime: number;
  streamingProviders: string[];
}

export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
}
