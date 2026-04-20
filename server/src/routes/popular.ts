import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { discoverMovies, shapeTmdbSearchResult, TmdbSearchResult } from '../services/tmdb';
import { getInCinemaIds } from '../services/cinemaStatus';

const router = Router();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PAGES_TO_FETCH = 2;
const RESULT_CAP = 40;

let cache: { results: TmdbSearchResult[]; expires: number } | null = null;
let inflight: Promise<TmdbSearchResult[]> | null = null;

async function loadAllTimePopular(): Promise<TmdbSearchResult[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    const pages = await Promise.all(
      Array.from({ length: PAGES_TO_FETCH }, (_, i) =>
        discoverMovies({
          sortBy: 'vote_count.desc',
          voteCountGte: 2000,
          page: i + 1,
        }),
      ),
    );
    const seen = new Set<number>();
    const merged: TmdbSearchResult[] = [];
    for (const batch of pages) {
      for (const r of batch.results) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        merged.push(r);
      }
    }
    return merged.slice(0, RESULT_CAP);
  })()
    .catch((err) => {
      console.error('[popular] fetch failed', err);
      return [];
    })
    .finally(() => { inflight = null; });
  return inflight;
}

router.get('/all-time', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const now = Date.now();
    let results: TmdbSearchResult[];
    if (cache && now < cache.expires && cache.results.length > 0) {
      results = cache.results;
    } else {
      results = await loadAllTimePopular();
      if (results.length > 0) {
        cache = { results, expires: now + CACHE_TTL_MS };
      }
    }

    const [library, inCinemaSet] = await Promise.all([
      prisma.userMovie.findMany({
        where: { userId: req.userId! },
        select: { movie: { select: { tmdbId: true } } },
      }),
      getInCinemaIds(),
    ]);
    const excluded = new Set(
      library.map((r) => r.movie.tmdbId).filter((id): id is number => id !== null),
    );

    const movies = results
      .filter((r) => !excluded.has(r.id))
      .map((r) => shapeTmdbSearchResult(r, inCinemaSet));

    res.json({ movies });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
