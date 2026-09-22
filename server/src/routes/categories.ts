import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CATEGORIES, getCategory, type CategoryDef } from '../data/categories';
import { searchMovie, shapeTmdbSearchResult, TmdbSearchResult, TMDB_IMAGE_BASE } from '../services/tmdb';
import { getInCinemaIds } from '../services/cinemaStatus';

const router = Router();

const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// A partial resolve (TMDB hiccup) is served briefly, then retried, instead of
// pinning a half-empty deck for a full day.
const PARTIAL_CACHE_TTL_MS = 5 * 60 * 1000;
const resolvedCache = new Map<string, { results: TmdbSearchResult[]; expires: number }>();
const inflight = new Map<string, Promise<TmdbSearchResult[]>>();

function getCachedCategory(slug: string): TmdbSearchResult[] | null {
  const cached = resolvedCache.get(slug);
  return cached && Date.now() < cached.expires ? cached.results : null;
}

async function resolveCategory(def: CategoryDef): Promise<TmdbSearchResult[]> {
  const cached = getCachedCategory(def.slug);
  if (cached) return cached;
  const pending = inflight.get(def.slug);
  if (pending) return pending;

  const promise = (async () => {
    const found = await Promise.all(def.movies.map((m) => searchMovie(m.title, m.year)));
    const results = found.filter((r): r is TmdbSearchResult => r !== null);
    const complete = results.length >= Math.ceil(def.movies.length * 0.8);
    resolvedCache.set(def.slug, {
      results,
      expires: Date.now() + (complete ? CATEGORY_CACHE_TTL_MS : PARTIAL_CACHE_TTL_MS),
    });
    return results;
  })().finally(() => inflight.delete(def.slug));

  inflight.set(def.slug, promise);
  return promise;
}

/** Resolve every deck ahead of the first request. One deck at a time to leave TMDB headroom. */
export async function warmCategoryCache(): Promise<void> {
  for (const def of CATEGORIES) {
    await resolveCategory(def).catch(() => []);
  }
}

router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    // The grid only needs a cover per deck, so a cold cache costs one search per
    // category rather than resolving all ~240 titles up front.
    const summaries = await Promise.all(
      CATEGORIES.map(async (def) => {
        const resolved = getCachedCategory(def.slug);
        const cover = resolved?.[0] ?? (def.movies[0] ? await searchMovie(def.movies[0].title, def.movies[0].year) : null);
        return {
          slug: def.slug,
          label: def.label,
          accent: def.accent,
          posterUrl: cover?.poster_path ? `${TMDB_IMAGE_BASE}${cover.poster_path}` : null,
          movieCount: resolved?.length ?? def.movies.length,
        };
      }),
    );
    res.json({ categories: summaries });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

router.get('/:slug/movies', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const def = getCategory(slug);
    if (!def) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    const [results, inCinemaSet] = await Promise.all([
      resolveCategory(def),
      getInCinemaIds(),
    ]);
    const movies = results.map((r) => shapeTmdbSearchResult(r, inCinemaSet));
    res.json({
      slug: def.slug,
      label: def.label,
      accent: def.accent,
      movies,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load category' });
  }
});

export default router;
