import * as cheerio from 'cheerio';

const LETTERBOXD_BASE = 'https://letterboxd.com';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_CAP = 50;

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

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
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

export async function assertProfileExists(username: string): Promise<void> {
  const url = `${LETTERBOXD_BASE}/${username}/`;
  try {
    const html = await fetchPage(url);
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

export function parseFilmPage(html: string, url: string): FilmEntry[] {
  const $ = cheerio.load(html);
  const tiles = $('li.poster-container div.film-poster');
  if (tiles.length === 0) return [];

  const out: FilmEntry[] = [];
  tiles.each((_, el) => {
    const $el = $(el);
    const slug = ($el.attr('data-film-slug') || $el.attr('data-target-link') || '').replace(/^\/film\//, '').replace(/\/$/, '');
    if (!slug) return;
    const title = $el.find('img').attr('alt')?.trim() || '';
    const yearAttr = $el.attr('data-film-release-year');
    const year = yearAttr && /^\d{4}$/.test(yearAttr) ? parseInt(yearAttr, 10) : null;
    if (!title) {
      const snippet = $.html($el).slice(0, 400);
      console.error('[letterboxd] missing title on tile', { url, selector: 'div.film-poster img[alt]', snippet });
      return;
    }
    out.push({ slug, title, year });
  });
  return out;
}

export function parseRatedPage(html: string, url: string): RatedEntry[] {
  const $ = cheerio.load(html);
  const tiles = $('li.poster-container');
  if (tiles.length === 0) return [];

  const out: RatedEntry[] = [];
  tiles.each((_, el) => {
    const $tile = $(el);
    const $poster = $tile.find('div.film-poster');
    const slug = ($poster.attr('data-film-slug') || $poster.attr('data-target-link') || '').replace(/^\/film\//, '').replace(/\/$/, '');
    if (!slug) return;
    const title = $poster.find('img').attr('alt')?.trim() || '';
    const yearAttr = $poster.attr('data-film-release-year');
    const year = yearAttr && /^\d{4}$/.test(yearAttr) ? parseInt(yearAttr, 10) : null;

    let rating: number | null = null;
    const ratingClass = $tile.find('.rating').first().attr('class') || '';
    const ratedMatch = /rated-(\d{1,2})/.exec(ratingClass);
    if (ratedMatch) {
      const halfStars = parseInt(ratedMatch[1], 10);
      if (halfStars >= 1 && halfStars <= 10) rating = halfStars / 2;
    }
    if (rating === null) {
      const ratingText = $tile.find('.rating').first().text().trim();
      const starMatch = /^([\u2605]+)([\u00BD]?)$/.exec(ratingText);
      if (starMatch) {
        const stars = starMatch[1].length + (starMatch[2] ? 0.5 : 0);
        if (stars > 0 && stars <= 5) rating = stars;
      }
    }

    if (!title) {
      const snippet = $.html($poster).slice(0, 400);
      console.error('[letterboxd] missing title on rated tile', { url, selector: 'div.film-poster img[alt]', snippet });
      return;
    }
    out.push({ slug, title, year, rating });
  });
  return out;
}

async function walkPages<T>(
  buildUrl: (page: number) => string,
  parse: (html: string, url: string) => T[],
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= PAGE_CAP; page++) {
    const url = buildUrl(page);
    const html = await fetchPage(url);
    const entries = parse(html, url);
    if (entries.length === 0) break;
    out.push(...entries);
    if (entries.length < 20) break;
  }
  return out;
}

export async function fetchWatchlist(username: string): Promise<FilmEntry[]> {
  return walkPages(
    (p) => `${LETTERBOXD_BASE}/${username}/watchlist/page/${p}/`,
    parseFilmPage,
  );
}

export async function fetchRated(username: string): Promise<RatedEntry[]> {
  return walkPages(
    (p) => `${LETTERBOXD_BASE}/${username}/films/by/entry-rating/page/${p}/`,
    parseRatedPage,
  );
}
