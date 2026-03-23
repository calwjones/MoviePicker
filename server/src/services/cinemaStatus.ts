import { getNowPlayingMovies } from './tmdb';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PAGES_TO_FETCH = 5;
const REGION = 'GB';

let cachedIds: Set<number> | null = null;
let cachedAt = 0;
let inflight: Promise<Set<number>> | null = null;

async function refreshCache(): Promise<Set<number>> {
  const ids = new Set<number>();
  for (let page = 1; page <= PAGES_TO_FETCH; page++) {
    const results = await getNowPlayingMovies(page, REGION);
    if (results.length === 0) break;
    for (const r of results) ids.add(r.id);
  }
  cachedIds = ids;
  cachedAt = Date.now();
  return ids;
}

export async function getInCinemaIds(): Promise<Set<number>> {
  const now = Date.now();
  if (cachedIds && now - cachedAt < CACHE_TTL_MS) return cachedIds;
  if (inflight) return inflight;
  inflight = refreshCache().finally(() => { inflight = null; });
  try {
    return await inflight;
  } catch (err) {
    console.error('[cinemaStatus] refresh failed:', err);
    return cachedIds ?? new Set<number>();
  }
}

export function attachInCinema<T extends { tmdbId?: number | null }>(
  movie: T,
  set: Set<number>,
): T & { inCinema: boolean } {
  return { ...movie, inCinema: movie.tmdbId != null && set.has(movie.tmdbId) };
}
