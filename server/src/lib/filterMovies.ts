import type { Movie } from '@prisma/client';

interface MovieFilters {
  genres?: string[];
  decade?: string;
  minRating?: number;
  maxRuntime?: number;
  streamingProviders?: string[];
}

export function applyMovieFilters(movies: Movie[], filters: MovieFilters): Movie[] {
  let result = movies;

  if (filters.genres && filters.genres.length > 0) {
    result = result.filter((m) => {
      const movieGenres = m.genres as string[];
      return filters.genres!.some((g: string) => movieGenres.includes(g));
    });
  }
  if (filters.decade) {
    const decadeStart = parseInt(filters.decade);
    result = result.filter((m) => m.year && m.year >= decadeStart && m.year < decadeStart + 10);
  }
  if (filters.minRating) {
    result = result.filter((m) => m.tmdbRating && m.tmdbRating >= filters.minRating!);
  }
  if (filters.maxRuntime) {
    result = result.filter((m) => m.runtime && m.runtime <= filters.maxRuntime!);
  }
  if (filters.streamingProviders?.length) {
    result = result.filter((m) => {
      const providers = m.streamingProviders as { name: string; type: string }[];
      return providers.some((p) => filters.streamingProviders!.includes(p.name) && p.type === 'stream');
    });
  }

  return result;
}
