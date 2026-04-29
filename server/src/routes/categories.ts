import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CATEGORIES, getCategory, type CategoryDef } from '../data/categories';
import { searchMovie, shapeTmdbSearchResult, TmdbSearchResult, TMDB_IMAGE_BASE } from '../services/tmdb';
import { getInCinemaIds } from '../services/cinemaStatus';

const router = Router();

const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const resolvedCache = new Map<string, { results: TmdbSearchResult[]; expires: number }>();

async function resolveCategory(def: CategoryDef): Promise<TmdbSearchResult[]> {
  const cached = resolvedCache.get(def.slug);
  if (cached && Date.now() < cached.expires) return cached.results;

  const found = await Promise.all(
    def.movies.map((m) => searchMovie(m.title, m.year)),
  );
  const results = found.filter((r): r is TmdbSearchResult => r !== null);
  resolvedCache.set(def.slug, { results, expires: Date.now() + CATEGORY_CACHE_TTL_MS });
  return results;
}

router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const summaries = await Promise.all(
      CATEGORIES.map(async (def) => {
        const results = await resolveCategory(def);
        const cover = results[0];
        return {
          slug: def.slug,
          label: def.label,
          accent: def.accent,
          posterUrl: cover?.poster_path ? `${TMDB_IMAGE_BASE}${cover.poster_path}` : null,
          movieCount: results.length,
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
