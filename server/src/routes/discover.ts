import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { discoverMovies, shapeTmdbSearchResult, TmdbSearchResult } from '../services/tmdb';
import { mapGenreNamesToIds } from '../services/tmdbGenres';
import { getInCinemaIds } from '../services/cinemaStatus';

const router = Router();

const BAYESIAN_PRIOR_VOTES = 500;
const BAYESIAN_PRIOR_MEAN = 6.8;
const TOP_BAND_RATIO = 0.6;
const TMDB_PAGES_PER_POOL = 5;
const TMDB_PAGE_WINDOW = 15;
const POOL_CACHE_TTL_MS = 2 * 60 * 1000;

interface PoolCacheEntry {
  merged: TmdbSearchResult[];
  maxTmdbTotalPages: number;
  expires: number;
}

const poolCache = new Map<string, PoolCacheEntry>();

function poolCacheKey(opts: {
  genreIds?: number[];
  minRating?: number;
  releaseDateGte?: string;
  releaseDateLte?: string;
  watchProviderIds?: number[];
}): string {
  return JSON.stringify({
    g: opts.genreIds?.slice().sort((a, b) => a - b) ?? null,
    m: opts.minRating ?? null,
    d1: opts.releaseDateGte ?? null,
    d2: opts.releaseDateLte ?? null,
    p: opts.watchProviderIds?.slice().sort((a, b) => a - b) ?? null,
  });
}

function weightedScore(voteAverage: number, voteCount: number): number {
  const v = Math.max(0, voteCount);
  const r = Math.max(0, voteAverage);
  return (v / (v + BAYESIAN_PRIOR_VOTES)) * r + (BAYESIAN_PRIOR_VOTES / (v + BAYESIAN_PRIOR_VOTES)) * BAYESIAN_PRIOR_MEAN;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function samplePages(windowSize: number, count: number): number[] {
  const pool = Array.from({ length: windowSize }, (_, i) => i + 1);
  shuffleInPlace(pool);
  return pool.slice(0, Math.min(count, windowSize));
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const genreNames = typeof req.query.genres === 'string' && req.query.genres.length > 0
      ? req.query.genres.split(',').map((g) => g.trim()).filter(Boolean)
      : [];
    const genreIds = mapGenreNamesToIds(genreNames);

    const minRating = req.query.minRating ? parseFloat(req.query.minRating as string) : undefined;
    const decade = typeof req.query.decade === 'string' && req.query.decade.length > 0
      ? parseInt(req.query.decade, 10)
      : undefined;
    const pageParam = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const safePage = !isNaN(pageParam) && pageParam > 0 ? pageParam : 1;

    const providersParam = typeof req.query.providers === 'string' ? req.query.providers : '';
    let watchProviderIds: number[] | undefined;
    if (providersParam === 'none') {
      watchProviderIds = undefined;
    } else if (providersParam.length > 0) {
      watchProviderIds = providersParam
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
    } else {
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { preferredStreamingProviderIds: true },
      });
      const prefs = user?.preferredStreamingProviderIds ?? [];
      watchProviderIds = prefs.length > 0 ? prefs : undefined;
    }

    let releaseDateGte: string | undefined;
    let releaseDateLte: string | undefined;
    if (decade && !isNaN(decade)) {
      releaseDateGte = `${decade}-01-01`;
      releaseDateLte = `${decade + 9}-12-31`;
    }

    const baseOpts = { genreIds, minRating, releaseDateGte, releaseDateLte, watchProviderIds };
    const cacheKey = poolCacheKey(baseOpts);

    const cachedPool = poolCache.get(cacheKey);
    const poolFresh = cachedPool && Date.now() < cachedPool.expires;

    const poolPromise: Promise<{ merged: TmdbSearchResult[]; maxTmdbTotalPages: number }> = poolFresh
      ? Promise.resolve({ merged: cachedPool.merged, maxTmdbTotalPages: cachedPool.maxTmdbTotalPages })
      : (async () => {
        const tmdbPages = samplePages(TMDB_PAGE_WINDOW, TMDB_PAGES_PER_POOL);
        const [topRatedBatches, mostVotedBatches] = await Promise.all([
          Promise.all(tmdbPages.map((p) => discoverMovies({ ...baseOpts, sortBy: 'vote_average.desc', voteCountGte: 1500, page: p }))),
          Promise.all(tmdbPages.map((p) => discoverMovies({ ...baseOpts, sortBy: 'vote_count.desc', voteCountGte: BAYESIAN_PRIOR_VOTES, page: p }))),
        ]);

        const seen = new Set<number>();
        const merged: TmdbSearchResult[] = [];
        for (const batch of [...topRatedBatches, ...mostVotedBatches]) {
          for (const r of batch.results) {
            if (seen.has(r.id)) continue;
            seen.add(r.id);
            merged.push(r);
          }
        }

        const maxTmdbTotalPages = Math.max(
          ...topRatedBatches.map((b) => b.totalPages),
          ...mostVotedBatches.map((b) => b.totalPages),
          1,
        );

        poolCache.set(cacheKey, { merged, maxTmdbTotalPages, expires: Date.now() + POOL_CACHE_TTL_MS });
        return { merged, maxTmdbTotalPages };
      })();

    const [{ merged, maxTmdbTotalPages }, library, inCinemaSet] = await Promise.all([
      poolPromise,
      prisma.userMovie.findMany({
        where: { userId: req.userId! },
        select: { movie: { select: { tmdbId: true } } },
      }),
      getInCinemaIds(),
    ]);

    const excluded = new Set(library.map((r) => r.movie.tmdbId).filter((id): id is number => id !== null));

    const ranked = merged
      .filter((r) => !excluded.has(r.id))
      .map((r) => ({ r, score: weightedScore(r.vote_average ?? 0, r.vote_count ?? 0) }))
      .sort((a, b) => b.score - a.score);

    const topBandSize = Math.max(1, Math.ceil(ranked.length * TOP_BAND_RATIO));
    const topBand = ranked.slice(0, topBandSize).map((x) => x.r);

    const movies = shuffleInPlace(topBand).map((r) => shapeTmdbSearchResult(r, inCinemaSet));

    const totalPages = Math.max(1, Math.ceil(maxTmdbTotalPages / TMDB_PAGES_PER_POOL));

    res.json({ movies, totalPages, page: safePage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
