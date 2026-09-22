import type { Movie, Prisma } from '@prisma/client';
import { prisma } from '../app';
import { tmdbGet, TTL } from './tmdbClient';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
// Provider logos render at ~20px, so w92 covers 2x/3x screens at a fraction of w500's weight.
const TMDB_LOGO_BASE = 'https://image.tmdb.org/t/p/w92';
const PROVIDER_REGION = 'GB';

export interface TmdbSearchResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string;
  overview?: string;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
}

interface TmdbProviderEntry {
  provider_name: string;
  logo_path: string;
}

interface TmdbRegionProviders {
  flatrate?: TmdbProviderEntry[];
  rent?: TmdbProviderEntry[];
  buy?: TmdbProviderEntry[];
}

interface TmdbWatchProviders {
  results?: Record<string, TmdbRegionProviders | undefined> & { GB?: TmdbRegionProviders };
}

interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official?: boolean;
  iso_639_1?: string;
}

interface TmdbMovieDetail {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string;
  overview?: string;
  genres?: { id: number; name: string }[];
  runtime?: number;
  vote_average?: number;
  credits?: {
    crew?: { job: string; name: string }[];
    cast?: { name: string; order: number }[];
  };
  'watch/providers'?: TmdbWatchProviders;
  videos?: { results?: TmdbVideo[] };
}

type Paged<T> = { results?: T[]; total_pages?: number };

function parseYear(date?: string): number | null {
  if (!date) return null;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export async function searchMovie(title: string, year?: number): Promise<TmdbSearchResult | null> {
  const hasYear = year != null && !isNaN(year);
  const data = await tmdbGet<Paged<TmdbSearchResult>>(
    '/search/movie',
    { query: title, year: hasYear ? year : undefined },
    { ttlMs: 6 * TTL.hour },
  );
  const first = data?.results?.[0];
  if (first || !hasYear) return first ?? null;

  // Letterboxd and TMDB occasionally disagree on release year by one (festival vs.
  // wide release). Retry without the year and accept a near miss.
  const loose = await tmdbGet<Paged<TmdbSearchResult>>(
    '/search/movie',
    { query: title },
    { ttlMs: 6 * TTL.hour },
  );
  return loose?.results?.find((r) => {
    const y = parseYear(r.release_date);
    return y != null && Math.abs(y - year!) <= 1;
  }) ?? null;
}

export async function searchMovies(query: string, page = 1): Promise<{ results: TmdbSearchResult[]; totalPages: number }> {
  const data = await tmdbGet<Paged<TmdbSearchResult>>(
    '/search/movie',
    { query, page },
    { ttlMs: 6 * TTL.hour },
  );
  return { results: data?.results ?? [], totalPages: data?.total_pages ?? 0 };
}

/** Details, credits, watch providers and videos in a single round trip. */
export async function getMovieDetails(tmdbId: number): Promise<TmdbMovieDetail | null> {
  return tmdbGet<TmdbMovieDetail>(
    `/movie/${tmdbId}`,
    { append_to_response: 'credits,watch/providers,videos' },
    { ttlMs: 6 * TTL.hour },
  );
}

export async function getWatchProviders(tmdbId: number): Promise<TmdbWatchProviders['results']> {
  const data = await tmdbGet<TmdbWatchProviders>(`/movie/${tmdbId}/watch/providers`, {}, { ttlMs: 6 * TTL.hour });
  return data?.results ?? {};
}

export function pickTrailerKey(videos: TmdbVideo[] | undefined): string | null {
  if (!videos || videos.length === 0) return null;
  const youtube = videos.filter((v) => v.site === 'YouTube' && v.key);
  const rank = (v: TmdbVideo) =>
    (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 2 : 4) +
    (v.official ? 0 : 1) +
    (v.iso_639_1 && v.iso_639_1 !== 'en' ? 0.5 : 0);
  const best = youtube
    .filter((v) => v.type === 'Trailer' || v.type === 'Teaser')
    .sort((a, b) => rank(a) - rank(b))[0];
  return best?.key ?? null;
}

function buildProviderList(region: TmdbRegionProviders | undefined) {
  const list: { name: string; type: string; logoUrl: string }[] = [];
  for (const p of region?.flatrate ?? []) {
    list.push({ name: p.provider_name, type: 'stream', logoUrl: `${TMDB_LOGO_BASE}${p.logo_path}` });
  }
  for (const p of region?.rent ?? []) {
    list.push({ name: p.provider_name, type: 'rent', logoUrl: `${TMDB_LOGO_BASE}${p.logo_path}` });
  }
  return list;
}

function buildMovieData(details: TmdbMovieDetail, providers?: TmdbWatchProviders['results']) {
  const region = (providers ?? details['watch/providers']?.results)?.[PROVIDER_REGION];

  const director = details.credits?.crew?.find((c) => c.job === 'Director')?.name || null;
  const cast = details.credits?.cast
    ?.slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 5)
    .map((c) => c.name) || [];

  return {
    tmdbId: details.id,
    title: details.title,
    year: parseYear(details.release_date),
    posterUrl: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : null,
    overview: details.overview || null,
    genres: details.genres?.map((g) => g.name) || [],
    director,
    cast,
    runtime: details.runtime || null,
    tmdbRating: details.vote_average || null,
    streamingProviders: buildProviderList(region),
    trailerKey: pickTrailerKey(details.videos?.results),
    tmdbSyncedAt: new Date(),
  } satisfies Prisma.MovieCreateInput;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002';
}

async function createMovieFromTmdb(tmdbId: number): Promise<Movie | null> {
  const details = await getMovieDetails(tmdbId);
  if (!details) return null;
  const data = buildMovieData(details);
  try {
    return await prisma.movie.upsert({ where: { tmdbId }, update: {}, create: data });
  } catch (err) {
    // Two imports racing on the same film: the other writer won, use its row.
    if (isUniqueViolation(err)) return prisma.movie.findUnique({ where: { tmdbId } });
    throw err;
  }
}

export async function findOrCreateMovie(title: string, year?: number): Promise<Movie | null> {
  // Most imported titles are already in the catalogue; an exact title+year hit
  // skips TMDB entirely.
  if (year != null && !isNaN(year)) {
    const local = await prisma.movie.findFirst({ where: { title, year } });
    if (local) return local;
  }

  const searchResult = await searchMovie(title, year);
  if (!searchResult) return null;

  const existing = await prisma.movie.findUnique({ where: { tmdbId: searchResult.id } });
  if (existing) return existing;

  return createMovieFromTmdb(searchResult.id);
}

export async function findOrCreateMovieByTmdbId(tmdbId: number): Promise<Movie | null> {
  const existing = await prisma.movie.findUnique({ where: { tmdbId } });
  if (existing) return existing;
  return createMovieFromTmdb(tmdbId);
}

// Streaming catalogues churn monthly, so provider data older than this is re-fetched.
export const MOVIE_STALE_AFTER_MS = 7 * TTL.day;

export function isMovieStale(movie: Pick<Movie, 'tmdbSyncedAt'>): boolean {
  return !movie.tmdbSyncedAt || Date.now() - movie.tmdbSyncedAt.getTime() > MOVIE_STALE_AFTER_MS;
}

const refreshing = new Map<string, Promise<Movie>>();

/**
 * Re-sync a stored movie's volatile fields (providers, rating, trailer) from TMDB.
 * Never throws: on any failure the stored row is returned unchanged.
 */
export async function refreshMovie(movie: Movie): Promise<Movie> {
  const pending = refreshing.get(movie.id);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const details = await getMovieDetails(movie.tmdbId);
      if (!details) return movie;
      const fresh = buildMovieData(details);
      return await prisma.movie.update({
        where: { id: movie.id },
        data: {
          streamingProviders: fresh.streamingProviders,
          tmdbRating: fresh.tmdbRating ?? movie.tmdbRating,
          trailerKey: fresh.trailerKey,
          posterUrl: fresh.posterUrl ?? movie.posterUrl,
          runtime: movie.runtime ?? fresh.runtime,
          director: movie.director ?? fresh.director,
          tmdbSyncedAt: fresh.tmdbSyncedAt,
        },
      });
    } catch (err) {
      console.error('[tmdb] refresh failed', movie.tmdbId, err);
      return movie;
    }
  })().finally(() => refreshing.delete(movie.id));

  refreshing.set(movie.id, promise);
  return promise;
}

export async function refreshIfStale(movie: Movie): Promise<Movie> {
  return isMovieStale(movie) ? refreshMovie(movie) : movie;
}

/** Fire-and-forget refresh of the stalest movies in a set, bounded so it never floods TMDB. */
export function refreshStaleInBackground(movies: Movie[], limit = 25): void {
  const stale = movies
    .filter((m) => isMovieStale(m) && !refreshing.has(m.id))
    .sort((a, b) => (a.tmdbSyncedAt?.getTime() ?? 0) - (b.tmdbSyncedAt?.getTime() ?? 0))
    .slice(0, limit);
  if (stale.length === 0) return;
  void Promise.all(stale.map((m) => refreshMovie(m)));
}

export async function getAvailableProviders(region = PROVIDER_REGION): Promise<{ id: number; name: string; logoUrl: string; displayPriority: number }[]> {
  const data = await tmdbGet<{
    results?: {
      provider_id: number;
      provider_name: string;
      logo_path: string;
      display_priority?: number;
      display_priorities?: Record<string, number>;
    }[];
  }>('/watch/providers/movie', { watch_region: region }, { ttlMs: TTL.day });
  return (data?.results ?? []).map((p) => ({
    id: p.provider_id,
    name: p.provider_name,
    logoUrl: `${TMDB_LOGO_BASE}${p.logo_path}`,
    displayPriority: p.display_priorities?.[region] ?? p.display_priority ?? 9999,
  }));
}

export async function getTmdbRecommendations(tmdbId: number): Promise<TmdbSearchResult[]> {
  const data = await tmdbGet<Paged<TmdbSearchResult>>(`/movie/${tmdbId}/recommendations`, {}, { ttlMs: TTL.day });
  return data?.results ?? [];
}

export async function getTrendingMovies(page = 1): Promise<TmdbSearchResult[]> {
  const data = await tmdbGet<Paged<TmdbSearchResult>>('/trending/movie/week', { page }, { ttlMs: TTL.hour });
  return data?.results ?? [];
}

export async function getTopRatedMovies(page = 1): Promise<TmdbSearchResult[]> {
  const data = await tmdbGet<Paged<TmdbSearchResult>>(
    '/discover/movie',
    { 'vote_count.gte': 1000, sort_by: 'vote_average.desc', page },
    { ttlMs: TTL.day },
  );
  return data?.results ?? [];
}

export async function getNowPlayingMovies(page = 1, region?: string): Promise<TmdbSearchResult[]> {
  const data = await tmdbGet<Paged<TmdbSearchResult>>('/movie/now_playing', { page, region }, { ttlMs: 6 * TTL.hour });
  return data?.results ?? [];
}

export interface DiscoverParams {
  genreIds?: number[];
  genreMode?: 'any' | 'all';
  minRating?: number;
  releaseDateGte?: string;
  releaseDateLte?: string;
  voteCountGte?: number;
  sortBy?: string;
  page?: number;
  watchProviderIds?: number[];
  watchRegion?: string;
}

export async function discoverMovies(opts: DiscoverParams): Promise<{ results: TmdbSearchResult[]; totalPages: number }> {
  const params: Record<string, string | number | undefined> = {
    sort_by: opts.sortBy || 'popularity.desc',
    'vote_count.gte': opts.voteCountGte ?? 150,
    page: opts.page ?? 1,
  };
  if (opts.genreIds && opts.genreIds.length > 0) {
    params.with_genres = opts.genreIds.join(opts.genreMode === 'all' ? ',' : '|');
  }
  if (opts.minRating != null && opts.minRating > 0) params['vote_average.gte'] = opts.minRating;
  if (opts.releaseDateGte) params['primary_release_date.gte'] = opts.releaseDateGte;
  if (opts.releaseDateLte) params['primary_release_date.lte'] = opts.releaseDateLte;
  if (opts.watchProviderIds && opts.watchProviderIds.length > 0) {
    params.with_watch_providers = opts.watchProviderIds.join('|');
    params.watch_region = opts.watchRegion || PROVIDER_REGION;
    params.with_watch_monetization_types = 'flatrate';
  }

  const data = await tmdbGet<Paged<TmdbSearchResult>>('/discover/movie', params, { ttlMs: TTL.hour });
  return { results: data?.results ?? [], totalPages: data?.total_pages ?? 0 };
}

export function shapeTmdbSearchResult(r: TmdbSearchResult, inCinemaSet?: Set<number>) {
  return {
    tmdbId: r.id,
    title: r.title,
    year: parseYear(r.release_date),
    posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
    overview: r.overview || null,
    rating: r.vote_average || null,
    inCinema: inCinemaSet ? inCinemaSet.has(r.id) : false,
  };
}

export { TMDB_IMAGE_BASE };
