import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  TmdbSearchResult,
  discoverMovies,
  getNowPlayingMovies,
  getTopRatedMovies,
  getTrendingMovies,
  shapeTmdbSearchResult,
} from '../services/tmdb';
import { TMDB_GENRE_IDS } from '../services/tmdbGenres';
import { buildForYouRecommendations } from '../services/recommendations';
import { getInCinemaIds } from '../services/cinemaStatus';

const router = Router();

interface BrowseRow {
  id: string;
  title: string;
  movies: ReturnType<typeof shapeTmdbSearchResult>[] | Awaited<ReturnType<typeof buildForYouRecommendations>>;
}

const ROW_CAP = 20;
const POOL_PAGES = 3;
const TOP_RATED_POOL_PAGES = 6;
const TOP_RATED_PAGE_WINDOW = 20;
const PERSONALISED_HISTORY_FLOOR = 5;
const EDITORIAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const EDITORIAL_PICK_COUNT = 3;
const GENRE_POOL_SIZE = 6;
const GENRE_PICK_COUNT = 3;

const editorialCache = new Map<string, { results: TmdbSearchResult[]; expires: number }>();
const inflightRefresh = new Map<string, Promise<TmdbSearchResult[]>>();

function setCached(key: string, results: TmdbSearchResult[]): void {
  editorialCache.set(key, { results, expires: Date.now() + EDITORIAL_CACHE_TTL_MS });
}

function refresh(key: string, loader: () => Promise<TmdbSearchResult[]>, fallback: TmdbSearchResult[] | null): Promise<TmdbSearchResult[]> {
  const existing = inflightRefresh.get(key);
  if (existing) return existing;
  const promise = loader()
    .then((results) => {
      if (results.length > 0) setCached(key, results);
      return results;
    })
    .catch((err) => {
      console.error(`[browse] cache refresh failed for ${key}`, err);
      return fallback ?? [];
    })
    .finally(() => inflightRefresh.delete(key));
  inflightRefresh.set(key, promise);
  return promise;
}

async function fetchCached(key: string, loader: () => Promise<TmdbSearchResult[]>): Promise<TmdbSearchResult[]> {
  const entry = editorialCache.get(key);
  if (entry) {
    if (Date.now() > entry.expires) {
      void refresh(key, loader, entry.results);
    }
    return entry.results;
  }
  return refresh(key, loader, null);
}

async function fetchPages(
  fetcher: (page: number) => Promise<TmdbSearchResult[]>,
  pages: number | number[],
): Promise<TmdbSearchResult[]> {
  const pageList = typeof pages === 'number'
    ? Array.from({ length: pages }, (_, i) => i + 1)
    : pages;
  const batches = await Promise.all(pageList.map((p) => fetcher(p)));
  const seen = new Set<number>();
  const combined: TmdbSearchResult[] = [];
  for (const batch of batches) {
    for (const r of batch) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      combined.push(r);
    }
  }
  return combined;
}

function samplePages(windowSize: number, count: number): number[] {
  const pool = Array.from({ length: windowSize }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, windowSize));
}

function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function getLibraryTmdbIds(userId: string): Promise<Set<number>> {
  const rows = await prisma.userMovie.findMany({
    where: { userId },
    select: { movie: { select: { tmdbId: true } } },
  });
  return new Set(rows.map((r) => r.movie.tmdbId).filter((id): id is number => id !== null));
}

interface EditorialRowDef {
  id: string;
  title: string;
  loader: () => Promise<TmdbSearchResult[]>;
}

function decadeLoader(startYear: number, endYear: number): () => Promise<TmdbSearchResult[]> {
  return () =>
    fetchPages(
      (page) =>
        discoverMovies({
          releaseDateGte: `${startYear}-01-01`,
          releaseDateLte: `${endYear}-12-31`,
          sortBy: 'vote_count.desc',
          voteCountGte: 500,
          page,
        }).then((r) => r.results),
      POOL_PAGES,
    );
}

const EDITORIAL_ROW_DEFS: EditorialRowDef[] = [
  {
    id: 'trending',
    title: 'Trending this week',
    loader: () => fetchPages(getTrendingMovies, POOL_PAGES),
  },
  {
    id: 'top_rated',
    title: 'All-time greats',
    loader: () => fetchPages(getTopRatedMovies, samplePages(TOP_RATED_PAGE_WINDOW, TOP_RATED_POOL_PAGES)),
  },
  {
    id: 'now_playing',
    title: 'New releases',
    loader: () => fetchPages(getNowPlayingMovies, POOL_PAGES),
  },
  {
    id: 'hidden_gems',
    title: 'Hidden gems',
    loader: () =>
      fetchPages(
        (page) =>
          discoverMovies({
            minRating: 7.5,
            voteCountGte: 300,
            sortBy: 'vote_average.desc',
            page,
          }).then((r) => r.results),
        POOL_PAGES,
      ),
  },
  {
    id: 'critically_acclaimed',
    title: 'Critically acclaimed',
    loader: () =>
      fetchPages(
        (page) =>
          discoverMovies({
            minRating: 8,
            voteCountGte: 1500,
            sortBy: 'vote_count.desc',
            page,
          }).then((r) => r.results),
        POOL_PAGES,
      ),
  },
  { id: 'decade_80s', title: 'From the 80s', loader: decadeLoader(1980, 1989) },
  { id: 'decade_90s', title: 'From the 90s', loader: decadeLoader(1990, 1999) },
  { id: 'decade_00s', title: 'From the 2000s', loader: decadeLoader(2000, 2009) },
  { id: 'decade_10s', title: 'From the 2010s', loader: decadeLoader(2010, 2019) },
];

function pickRandom<T>(arr: readonly T[], count: number): T[] {
  return shuffled(arr).slice(0, Math.min(count, arr.length));
}

async function getTopGenres(userId: string, limit = 3): Promise<{ name: string; id: number }[]> {
  const [matches, soloSwipes] = await Promise.all([
    prisma.match.findMany({
      where: { session: { OR: [{ userId }, { user2Id: userId }] } },
      include: { movie: { select: { genres: true } } },
    }),
    prisma.sessionMovie.findMany({
      where: {
        session: { userId, type: 'solo' },
        user1Swipe: 'right',
      },
      include: { movie: { select: { genres: true } } },
      take: 200,
    }),
  ]);

  const counts = new Map<string, number>();
  const bump = (genres: string[]) => {
    for (const g of genres) counts.set(g, (counts.get(g) ?? 0) + 1);
  };
  for (const m of matches) bump(m.movie.genres as string[]);
  for (const s of soloSwipes) bump(s.movie.genres as string[]);

  return Array.from(counts.entries())
    .filter(([name]) => TMDB_GENRE_IDS[name] != null)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => ({ name, id: TMDB_GENRE_IDS[name] }));
}

async function getHistoryCount(userId: string): Promise<number> {
  const [matches, soloRightSwipes] = await Promise.all([
    prisma.match.count({
      where: { session: { OR: [{ userId }, { user2Id: userId }] } },
    }),
    prisma.sessionMovie.count({
      where: {
        session: { userId, type: 'solo' },
        user1Swipe: 'right',
      },
    }),
  ]);
  return matches + soloRightSwipes;
}

function filterAndCap(results: TmdbSearchResult[], excluded: Set<number>): TmdbSearchResult[] {
  const out: TmdbSearchResult[] = [];
  for (const r of results) {
    if (excluded.has(r.id)) continue;
    out.push(r);
    if (out.length >= ROW_CAP) break;
  }
  return out;
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const [library, genrePool, historyCount] = await Promise.all([
      getLibraryTmdbIds(userId),
      getTopGenres(userId, GENRE_POOL_SIZE),
      getHistoryCount(userId),
    ]);

    const editorialPicks = pickRandom(EDITORIAL_ROW_DEFS, EDITORIAL_PICK_COUNT);
    const genrePicks = pickRandom(genrePool, GENRE_PICK_COUNT);

    const [editorialResults, genreRowResults, forYouRecs, inCinemaSet] = await Promise.all([
      Promise.all(editorialPicks.map((def) => fetchCached(def.id, def.loader))),
      Promise.all(
        genrePicks.map((g) =>
          fetchCached(`genre_${g.id}`, () =>
            fetchPages(
              (page) => discoverMovies({ genreIds: [g.id], page }).then((r) => r.results),
              POOL_PAGES,
            ),
          ),
        ),
      ),
      historyCount > 0 ? buildForYouRecommendations(userId, ROW_CAP) : Promise.resolve([]),
      getInCinemaIds(),
    ]);

    const shape = (r: TmdbSearchResult) => shapeTmdbSearchResult(r, inCinemaSet);

    const editorial: BrowseRow[] = editorialPicks
      .map((def, i) => ({
        id: def.id,
        title: def.title,
        movies: filterAndCap(shuffled(editorialResults[i] ?? []), library).map(shape),
      }))
      .filter((row) => row.movies.length > 0);

    const personalised: BrowseRow[] = [];
    genrePicks.forEach((genre, i) => {
      const filtered = filterAndCap(shuffled(genreRowResults[i] ?? []), library);
      if (filtered.length === 0) return;
      personalised.push({
        id: `genre_${genre.id}`,
        title: `Because you like ${genre.name}`,
        movies: filtered.map(shape),
      });
    });
    const forYouFiltered = forYouRecs.filter((r) => !library.has(r.tmdbId));
    if (forYouFiltered.length > 0) {
      personalised.push({
        id: 'for_you',
        title: 'More like your matches',
        movies: forYouFiltered,
      });
    }

    const rows = historyCount >= PERSONALISED_HISTORY_FLOOR
      ? [...personalised, ...editorial]
      : [...editorial, ...personalised];

    res.json({ rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export async function warmBrowseCache(): Promise<void> {
  await Promise.all(
    EDITORIAL_ROW_DEFS.map((def) => fetchCached(def.id, def.loader).catch(() => [])),
  );
}

export default router;
