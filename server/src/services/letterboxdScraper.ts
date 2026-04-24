import * as cheerio from 'cheerio';

const LETTERBOXD_BASE = 'https://letterboxd.com';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_CAP = 50;
const INTER_REQUEST_DELAY_MS = 250;

class CookieJar {
  private cookies = new Map<string, string>();

  absorb(headers: Headers): void {
    const raw = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : ([headers.get('set-cookie')].filter(Boolean) as string[]);
    for (const line of raw) {
      const firstSemi = line.indexOf(';');
      const pair = firstSemi >= 0 ? line.slice(0, firstSemi) : line;
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  header(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SCRAPINGANT_API_KEY = process.env.SCRAPINGANT_API_KEY;
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

function buildRequestUrl(targetUrl: string, sessionNumber: number): string {
  if (SCRAPINGANT_API_KEY) {
    const params = new URLSearchParams({
      url: targetUrl,
      'x-api-key': SCRAPINGANT_API_KEY,
      browser: 'false',
      proxy_country: 'us',
    });
    return `https://api.scrapingant.com/v2/general?${params.toString()}`;
  }
  if (SCRAPER_API_KEY) {
    const params = new URLSearchParams({
      api_key: SCRAPER_API_KEY,
      url: targetUrl,
      keep_headers: 'true',
      session_number: String(sessionNumber),
    });
    return `http://api.scraperapi.com/?${params.toString()}`;
  }
  return targetUrl;
}

function newSessionNumber(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export class LetterboxdProfileNotFound extends Error {
  code = 'profile_not_found' as const;
  constructor(public username: string) {
    super(`Letterboxd profile @${username} not found`);
  }
}

export class LetterboxdProfilePrivate extends Error {
  code = 'profile_private' as const;
  constructor(public username: string) {
    super(`Letterboxd profile @${username} is private`);
  }
}

export class LetterboxdRateLimited extends Error {
  code = 'rate_limited' as const;
  constructor() {
    super('Letterboxd rate-limited the request');
  }
}

export class LetterboxdMarkupError extends Error {
  code = 'markup_error' as const;
  constructor(message: string, public context?: { url?: string; selector?: string; snippet?: string }) {
    super(message);
  }
}

export type LetterboxdScraperError =
  | LetterboxdProfileNotFound
  | LetterboxdProfilePrivate
  | LetterboxdRateLimited
  | LetterboxdMarkupError;

export interface FilmEntry {
  slug: string;
  title: string;
  year: number | null;
}

export interface RatedEntry extends FilmEntry {
  rating: number | null;
}

let activeJobs = 0;
const MAX_CONCURRENT_JOBS = 4;

export async function withScrapeSlot<T>(task: () => Promise<T>): Promise<T> {
  while (activeJobs >= MAX_CONCURRENT_JOBS) {
    await new Promise((r) => setTimeout(r, 250));
  }
  activeJobs++;
  try {
    return await task();
  } finally {
    activeJobs--;
  }
}

interface FetchOpts {
  referer?: string;
  jar?: CookieJar;
  sessionNumber?: number;
}

async function fetchPage(url: string, opts: FetchOpts = {}): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': opts.referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
  };
  if (opts.referer) headers.Referer = opts.referer;
  const cookieHeader = opts.jar?.header();
  if (cookieHeader) headers.Cookie = cookieHeader;

  const requestUrl = buildRequestUrl(url, opts.sessionNumber ?? 0);
  const res = await fetch(requestUrl, { headers });
  opts.jar?.absorb(res.headers);

  if (res.status === 404) {
    throw { kind: 'not_found' as const };
  }
  if (res.status === 429) throw new LetterboxdRateLimited();
  if (res.status === 403) {
    throw new LetterboxdMarkupError(`Letterboxd blocked the request (HTTP 403) — likely bot protection`, { url });
  }
  if (!res.ok) {
    throw new LetterboxdMarkupError(`Letterboxd returned HTTP ${res.status}`, { url });
  }
  return res.text();
}

export async function assertProfileExists(username: string, jar?: CookieJar, sessionNumber?: number): Promise<void> {
  const url = `${LETTERBOXD_BASE}/${username}/`;
  try {
    const html = await fetchPage(url, { jar, sessionNumber });
    const $ = cheerio.load(html);
    const body = $('body').text().toLowerCase();
    if (body.includes('this member has set their profile to private')) {
      throw new LetterboxdProfilePrivate(username);
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'kind' in err && (err as { kind: string }).kind === 'not_found') {
      throw new LetterboxdProfileNotFound(username);
    }
    throw err;
  }
}

function parseItemName(raw: string): { title: string; year: number | null } {
  const trimmed = raw.trim();
  const yearMatch = /^(.+?)\s+\((\d{4})\)\s*$/.exec(trimmed);
  if (yearMatch) return { title: yearMatch[1].trim(), year: parseInt(yearMatch[2], 10) };
  return { title: trimmed, year: null };
}

export function parseFilmPage(html: string, url: string): FilmEntry[] {
  const $ = cheerio.load(html);
  const tiles = $('li.griditem [data-component-class="LazyPoster"]');
  if (tiles.length === 0) return [];

  const out: FilmEntry[] = [];
  tiles.each((_, el) => {
    const $el = $(el);
    const slug = ($el.attr('data-item-slug') || '').trim();
    if (!slug) return;
    const { title, year } = parseItemName($el.attr('data-item-name') || '');
    if (!title) return;
    out.push({ slug, title, year });
  });
  void url;
  return out;
}

export function parseRatedPage(html: string, url: string): RatedEntry[] {
  const $ = cheerio.load(html);
  const tiles = $('li.griditem');
  if (tiles.length === 0) return [];

  const out: RatedEntry[] = [];
  let firstTileHtml: string | null = null;
  let ratingsFound = 0;

  tiles.each((_, el) => {
    const $tile = $(el);
    const $poster = $tile.find('[data-component-class="LazyPoster"]').first();
    const slug = ($poster.attr('data-item-slug') || '').trim();
    if (!slug) return;
    const { title, year } = parseItemName($poster.attr('data-item-name') || '');
    if (!title) return;

    let rating: number | null = null;
    const ratedClassEl = $tile.find('[class*="rated-"]').first().attr('class') || '';
    const ratedAttr = ratedClassEl || $tile.find('.rating').first().attr('class') || '';
    const halfMatch = /rated-(\d{1,2})/.exec(ratedAttr);
    if (halfMatch) {
      const halfStars = parseInt(halfMatch[1], 10);
      if (halfStars >= 1 && halfStars <= 10) rating = halfStars / 2;
    }

    if (rating !== null) ratingsFound++;
    if (firstTileHtml === null) firstTileHtml = $.html($tile).slice(0, 1500);
    out.push({ slug, title, year, rating });
  });

  if (out.length > 0 && ratingsFound === 0 && firstTileHtml) {
    console.warn('[letterboxd] tiles parsed but no ratings detected', { url, firstTile: firstTileHtml });
  }

  return out;
}

async function walkPages<T>(
  buildUrl: (page: number) => string,
  parse: (html: string, url: string) => T[],
  initialReferer: string,
  jar?: CookieJar,
  sessionNumber?: number,
): Promise<T[]> {
  const out: T[] = [];
  let referer = initialReferer;
  for (let page = 1; page <= PAGE_CAP; page++) {
    const url = buildUrl(page);
    if (page > 1) await sleep(INTER_REQUEST_DELAY_MS);
    const html = await fetchPage(url, { referer, jar, sessionNumber });
    const entries = parse(html, url);
    if (entries.length === 0) {
      if (page === 1) {
        const snippet = html.slice(0, 800).replace(/\s+/g, ' ');
        console.error('[letterboxd] page 1 parsed 0 entries', {
          url,
          proxy: isProxyEnabled(),
          htmlLength: html.length,
          snippet,
        });
      }
      break;
    }
    out.push(...entries);
    if (entries.length < 20) break;
    referer = url;
  }
  return out;
}

export async function fetchWatchlist(username: string, jar?: CookieJar, sessionNumber?: number): Promise<FilmEntry[]> {
  return walkPages(
    (p) => `${LETTERBOXD_BASE}/${username}/watchlist/page/${p}/`,
    parseFilmPage,
    `${LETTERBOXD_BASE}/${username}/`,
    jar,
    sessionNumber,
  );
}

export async function fetchRated(username: string, jar?: CookieJar, sessionNumber?: number): Promise<RatedEntry[]> {
  return walkPages(
    (p) => `${LETTERBOXD_BASE}/${username}/films/by/entry-rating/page/${p}/`,
    parseRatedPage,
    `${LETTERBOXD_BASE}/${username}/`,
    jar,
    sessionNumber,
  );
}

export function createCookieJar(): CookieJar {
  return new CookieJar();
}

export function createSessionNumber(): number {
  return newSessionNumber();
}

export function isProxyEnabled(): boolean {
  return !!(SCRAPINGANT_API_KEY || SCRAPER_API_KEY);
}
