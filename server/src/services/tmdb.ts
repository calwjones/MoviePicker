import { prisma } from '../app';
import { TMDB_API_KEY } from '../config';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

function getApiKey(): string {
  return TMDB_API_KEY;
}

interface TmdbSearchResult {
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
}

interface TmdbWatchProviders {
  results?: {
    GB?: {
      flatrate?: { provider_name: string; logo_path: string }[];
      rent?: { provider_name: string; logo_path: string }[];
      buy?: { provider_name: string; logo_path: string }[];
    };
  };
}

let requestTimestamps: number[] = [];
const RATE_LIMIT = 35;
const RATE_WINDOW = 10000;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((t) => now - t < RATE_WINDOW);

  if (requestTimestamps.length >= RATE_LIMIT) {
    const waitTime = RATE_WINDOW - (now - requestTimestamps[0]);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  requestTimestamps.push(Date.now());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchMovie(title: string, year?: number): Promise<TmdbSearchResult | null> {
  const params = new URLSearchParams({
    api_key: getApiKey(),
    query: title,
  });
  if (year && !isNaN(year)) params.append('year', year.toString());

  try {
    const res = await rateLimitedFetch(`${TMDB_BASE}/search/movie?${params}`);
    if (!res.ok) return null;

    const data = (await res.json()) as { results?: TmdbSearchResult[] };
    return data.results?.[0] || null;
  } catch {
    return null;
  }
}

export async function searchMovies(query: string, page = 1): Promise<{ results: TmdbSearchResult[]; totalPages: number }> {
  const params = new URLSearchParams({
    api_key: getApiKey(),
    query,
    page: page.toString(),
  });

  try {
    const res = await rateLimitedFetch(`${TMDB_BASE}/search/movie?${params}`);
    if (!res.ok) return { results: [], totalPages: 0 };

    const data = (await res.json()) as { results?: TmdbSearchResult[]; total_pages?: number };
    return {
      results: data.results || [],
      totalPages: data.total_pages || 0,
    };
  } catch {
    return { results: [], totalPages: 0 };
  }
}

export async function getMovieDetails(tmdbId: number): Promise<TmdbMovieDetail | null> {
  const params = new URLSearchParams({
    api_key: getApiKey(),
    append_to_response: 'credits',
  });

  try {
    const res = await rateLimitedFetch(`${TMDB_BASE}/movie/${tmdbId}?${params}`);
    if (!res.ok) return null;

    return (await res.json()) as TmdbMovieDetail;
  } catch {
    return null;
  }
}

export async function getWatchProviders(tmdbId: number): Promise<TmdbWatchProviders['results']> {
  const params = new URLSearchParams({ api_key: getApiKey() });
  try {
    const res = await rateLimitedFetch(`${TMDB_BASE}/movie/${tmdbId}/watch/providers?${params}`);
    if (!res.ok) return {};

    const data = (await res.json()) as TmdbWatchProviders;
    return data.results || {};
  } catch {
    return {};
  }
}

function buildMovieData(details: TmdbMovieDetail, providers: TmdbWatchProviders['results']) {
  const ukProviders = providers?.GB;
  const streamingList: { name: string; type: string; logoUrl: string }[] = [];
  if (ukProviders?.flatrate) {
    for (const p of ukProviders.flatrate) {
      streamingList.push({
        name: p.provider_name,
        type: 'stream',
        logoUrl: `${TMDB_IMAGE_BASE}${p.logo_path}`,
      });
    }
  }
  if (ukProviders?.rent) {
    for (const p of ukProviders.rent) {
      streamingList.push({
        name: p.provider_name,
        type: 'rent',
        logoUrl: `${TMDB_IMAGE_BASE}${p.logo_path}`,
      });
    }
  }

  const director = details.credits?.crew?.find((c) => c.job === 'Director')?.name || null;
  const cast = details.credits?.cast
    ?.sort((a, b) => a.order - b.order)
    .slice(0, 5)
    .map((c) => c.name) || [];

  return {
    tmdbId: details.id,
    title: details.title,
    year: details.release_date ? parseInt(details.release_date.slice(0, 4)) : null,
    posterUrl: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : null,
    overview: details.overview || null,
    genres: details.genres?.map((g) => g.name) || [],
    director,
    cast,
    runtime: details.runtime || null,
    tmdbRating: details.vote_average || null,
    streamingProviders: streamingList,
  };
}

export async function findOrCreateMovie(title: string, year?: number) {
  const searchResult = await searchMovie(title, year);
  if (!searchResult) return null;

  const existing = await prisma.movie.findUnique({
    where: { tmdbId: searchResult.id },
  });
  if (existing) return existing;

  const details = await getMovieDetails(searchResult.id);
  if (!details) return null;

  const providers = await getWatchProviders(searchResult.id);
  const data = buildMovieData(details, providers);

  const movie = await prisma.movie.create({ data });
  return movie;
}

export async function findOrCreateMovieByTmdbId(tmdbId: number) {
  const existing = await prisma.movie.findUnique({
    where: { tmdbId },
  });
  if (existing) return existing;

  const details = await getMovieDetails(tmdbId);
  if (!details) return null;

  const providers = await getWatchProviders(tmdbId);
  const data = buildMovieData(details, providers);

  const movie = await prisma.movie.create({ data });
  return movie;
}

export async function getAvailableProviders(region = 'GB'): Promise<{ id: number; name: string; logoUrl: string }[]> {
  const params = new URLSearchParams({ api_key: getApiKey(), watch_region: region });
  try {
    const res = await rateLimitedFetch(`${TMDB_BASE}/watch/providers/movie?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: { provider_id: number; provider_name: string; logo_path: string }[] };
    return (data.results || []).map((p) => ({
      id: p.provider_id,
      name: p.provider_name,
      logoUrl: `${TMDB_IMAGE_BASE}${p.logo_path}`,
    }));
  } catch {
    return [];
  }
}

export async function getTmdbRecommendations(tmdbId: number): Promise<TmdbSearchResult[]> {
  const params = new URLSearchParams({ api_key: getApiKey() });
  try {
    const res = await rateLimitedFetch(`${TMDB_BASE}/movie/${tmdbId}/recommendations?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: TmdbSearchResult[] };
    return data.results || [];
  } catch {
    return [];
  }
}

export { TMDB_IMAGE_BASE };
