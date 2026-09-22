import type { MovieFilters } from './filterMovies';

export function isNonEmptyString(v: unknown, maxLength = 256): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLength;
}

/** TMDB ids are positive ints; anything beyond Postgres INT4 would overflow the column. */
export function parseTmdbId(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 2_147_483_647 ? v : null;
}

const MAX_BATCH = 500;

/** null = "all"; missing or invalid falls back to the default of 50. */
export function parseBatchSize(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.min(Math.floor(value), MAX_BATCH);
  return 50;
}

const strings = (v: unknown, max = 50): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 100).slice(0, max) : undefined;
const positive = (v: unknown, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : undefined;

/** Keep only well-formed filter fields; the result is stored and re-applied on every batch. */
export function sanitizeFilters(raw: unknown): MovieFilters {
  if (!raw || typeof raw !== 'object') return {};
  const f = raw as Record<string, unknown>;
  const out: MovieFilters = {};
  const genres = strings(f.genres);
  if (genres?.length) out.genres = genres;
  if (typeof f.decade === 'string' && /^\d{4}$/.test(f.decade)) out.decade = f.decade;
  const minRating = positive(f.minRating, 10);
  if (minRating) out.minRating = minRating;
  const maxRuntime = positive(f.maxRuntime, 1000);
  if (maxRuntime) out.maxRuntime = maxRuntime;
  const providers = strings(f.streamingProviders);
  if (providers?.length) out.streamingProviders = providers;
  return out;
}

/** Prisma "record to update not found". */
export function isNotFound(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2025';
}
