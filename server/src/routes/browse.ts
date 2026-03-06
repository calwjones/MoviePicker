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

const router = Router();

interface BrowseRow {
  id: string;
  title: string;
  movies: ReturnType<typeof shapeTmdbSearchResult>[] | Awaited<ReturnType<typeof buildForYouRecommendations>>;
}

const ROW_CAP = 20;
const PERSONALISED_HISTORY_FLOOR = 5;
const EDITORIAL_CACHE_TTL_MS = 60 * 60 * 1000;

const editorialCache = new Map<string, { results: TmdbSearchResult[]; expires: number }>();

function getCached(key: string): TmdbSearchResult[] | null {
  const entry = editorialCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    editorialCache.delete(key);
    return null;
  }
  return entry.results;
}

function setCached(key: string, results: TmdbSearchResult[]): void {
  editorialCache.set(key, { results, expires: Date.now() + EDITORIAL_CACHE_TTL_MS });
}

async function fetchCached(key: string, loader: () => Promise<TmdbSearchResult[]>): Promise<TmdbSearchResult[]> {
  const cached = getCached(key);
  if (cached) return cached;
  const results = await loader();
  if (results.length > 0) setCached(key, results);
  return results;
}

async function getLibraryTmdbIds(userId: string): Promise<Set<number>> {
  const rows = await prisma.userMovie.findMany({
    where: { userId },
    select: { movie: { select: { tmdbId: true } } },
  });
  return new Set(rows.map((r) => r.movie.tmdbId).filter((id): id is number => id !== null));
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

    const [library, topGenres, historyCount] = await Promise.all([
      getLibraryTmdbIds(userId),
      getTopGenres(userId, 3),
      getHistoryCount(userId),
    ]);

    const [trending, topRated, nowPlaying, genreRowResults, forYouRecs] = await Promise.all([
      fetchCached('trending', getTrendingMovies),
      fetchCached('top_rated', getTopRatedMovies),
      fetchCached('now_playing', getNowPlayingMovies),
      Promise.all(
        topGenres.map((g) =>
          fetchCached(`genre_${g.id}`, () => discoverMovies({ genreIds: [g.id] }).then((r) => r.results)),
        ),
      ),
      historyCount > 0 ? buildForYouRecommendations(userId, ROW_CAP) : Promise.resolve([]),
    ]);

    const editorial: BrowseRow[] = [
      { id: 'trending', title: 'Trending this week', movies: filterAndCap(trending, library).map(shapeTmdbSearchResult) },
      { id: 'top_rated', title: 'All-time greats', movies: filterAndCap(topRated, library).map(shapeTmdbSearchResult) },
      { id: 'now_playing', title: 'New releases', movies: filterAndCap(nowPlaying, library).map(shapeTmdbSearchResult) },
    ].filter((row) => row.movies.length > 0);

    const personalised: BrowseRow[] = [];
    topGenres.forEach((genre, i) => {
      const filtered = filterAndCap(genreRowResults[i] ?? [], library);
      if (filtered.length === 0) return;
      personalised.push({
        id: `genre_${genre.id}`,
        title: `Because you like ${genre.name}`,
        movies: filtered.map(shapeTmdbSearchResult),
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

export default router;
