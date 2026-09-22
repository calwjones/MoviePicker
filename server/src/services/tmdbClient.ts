import { TMDB_API_KEY } from '../config';

// Overridable so integration environments can point at a stub.
const TMDB_BASE = process.env.TMDB_API_BASE || 'https://api.themoviedb.org/3';

// TMDB's documented ceiling is ~50 req/s and ~20 open connections per IP.
// Stay comfortably under both; 429s are still handled below if we overshoot.
const MAX_CONCURRENT = 12;
const MAX_PER_WINDOW = 40;
const WINDOW_MS = 1000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 10_000;

const CACHE_MAX_ENTRIES = 1000;

type Waiter = () => void;

const waiters: Waiter[] = [];
const recentStarts: number[] = [];
let active = 0;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;

function pump(): void {
  while (waiters.length > 0 && active < MAX_CONCURRENT) {
    const now = Date.now();
    while (recentStarts.length > 0 && now - recentStarts[0] >= WINDOW_MS) recentStarts.shift();
    if (recentStarts.length >= MAX_PER_WINDOW) {
      if (!pumpTimer) {
        const wait = WINDOW_MS - (now - recentStarts[0]) + 1;
        pumpTimer = setTimeout(() => {
          pumpTimer = null;
          pump();
        }, wait);
      }
      return;
    }
    recentStarts.push(now);
    active++;
    waiters.shift()!();
  }
}

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    waiters.push(resolve);
    pump();
  });
}

function releaseSlot(): void {
  active--;
  pump();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryAfterMs(res: Response, attempt: number): number {
  const header = typeof res.headers?.get === 'function' ? res.headers.get('retry-after') : null;
  const seconds = header ? parseFloat(header) : NaN;
  const ms = Number.isFinite(seconds) ? seconds * 1000 : 500 * 2 ** attempt;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await acquireSlot();
    let res: Response | null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch {
      res = null;
    } finally {
      clearTimeout(timeout);
      releaseSlot();
    }

    const isLast = attempt === MAX_ATTEMPTS - 1;
    if (!res) {
      if (isLast) return null;
      await sleep(300 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 && !isLast) {
      await sleep(retryAfterMs(res, attempt));
      continue;
    }
    if (typeof res.status === 'number' && res.status >= 500 && !isLast) {
      await sleep(300 * 2 ** attempt);
      continue;
    }
    return res;
  }
  return null;
}

interface CacheEntry {
  value: unknown;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function cacheGet(key: string): { hit: boolean; value?: unknown } {
  const entry = cache.get(key);
  if (!entry) return { hit: false };
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return { hit: false };
  }
  // Refresh recency so hot keys survive LRU eviction.
  cache.delete(key);
  cache.set(key, entry);
  return { hit: true, value: entry.value };
}

function cacheSet(key: string, value: unknown, ttlMs: number): void {
  if (ttlMs <= 0) return;
  cache.set(key, { value, expires: Date.now() + ttlMs });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export interface TmdbGetOptions {
  /** How long a successful response stays cached. 0 disables caching. */
  ttlMs?: number;
}

/**
 * GET a TMDB endpoint. Returns the parsed JSON, or null on 404 / network failure /
 * any other non-OK status. Identical concurrent requests share one fetch.
 */
export async function tmdbGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  opts: TmdbGetOptions = {},
): Promise<T | null> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (v !== undefined && v !== '') query.set(k, String(v));
  }
  const cacheKey = `${path}?${query.toString()}`;
  const ttlMs = opts.ttlMs ?? 0;

  if (ttlMs > 0) {
    const cached = cacheGet(cacheKey);
    if (cached.hit) return cached.value as T | null;
  }

  const pending = inflight.get(cacheKey);
  if (pending) return pending as Promise<T | null>;

  const promise = (async (): Promise<T | null> => {
    const url = `${TMDB_BASE}${path}?${new URLSearchParams({ api_key: TMDB_API_KEY, ...Object.fromEntries(query) })}`;
    const res = await fetchWithRetry(url);
    if (!res || !res.ok) return null;
    try {
      const data = (await res.json()) as T;
      cacheSet(cacheKey, data, ttlMs);
      return data;
    } catch {
      return null;
    }
  })().finally(() => inflight.delete(cacheKey));

  inflight.set(cacheKey, promise);
  return promise;
}

export const TTL = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

/** Test hook: drop cached responses and pending requests. */
export function resetTmdbClientState(): void {
  cache.clear();
  inflight.clear();
}
