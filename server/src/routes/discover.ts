import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { discoverMovies, shapeTmdbSearchResult, TmdbSearchResult } from '../services/tmdb';
import { mapGenreNamesToIds } from '../services/tmdbGenres';

const router = Router();

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

    let releaseDateGte: string | undefined;
    let releaseDateLte: string | undefined;
    if (decade && !isNaN(decade)) {
      releaseDateGte = `${decade}-01-01`;
      releaseDateLte = `${decade + 9}-12-31`;
    }

    const baseOpts = { genreIds, minRating, releaseDateGte, releaseDateLte, page: safePage };

    const [popular, topRated, mostVoted] = await Promise.all([
      discoverMovies({ ...baseOpts, sortBy: 'popularity.desc', voteCountGte: 500 }),
      discoverMovies({ ...baseOpts, sortBy: 'vote_average.desc', voteCountGte: 1500 }),
      discoverMovies({ ...baseOpts, sortBy: 'vote_count.desc', voteCountGte: 500 }),
    ]);

    const seen = new Set<number>();
    const merged: TmdbSearchResult[] = [];
    for (const r of [...popular.results, ...topRated.results, ...mostVoted.results]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      merged.push(r);
    }

    const library = await prisma.userMovie.findMany({
      where: { userId: req.userId! },
      select: { movie: { select: { tmdbId: true } } },
    });
    const excluded = new Set(library.map((r) => r.movie.tmdbId).filter((id): id is number => id !== null));

    const movies = shuffleInPlace(merged.filter((r) => !excluded.has(r.id)))
      .map(shapeTmdbSearchResult);

    const totalPages = Math.max(
      1,
      Math.min(
        popular.totalPages || 1,
        topRated.totalPages || 1,
        mostVoted.totalPages || 1,
      ),
    );

    res.json({ movies, totalPages, page: safePage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
