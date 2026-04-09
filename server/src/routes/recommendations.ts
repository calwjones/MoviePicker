import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getTmdbRecommendations, TMDB_IMAGE_BASE, findOrCreateMovieByTmdbId } from '../services/tmdb';

const router = Router();

function scoreAndShape(
  recsBySeed: { seedTitle: string; recs: Awaited<ReturnType<typeof getTmdbRecommendations>> }[],
  knownTmdbIds: Set<number | null>,
  limit = 10,
) {
  const seedMap = new Map<number, string[]>();
  const recMap = new Map<number, Awaited<ReturnType<typeof getTmdbRecommendations>>[number]>();

  for (const { seedTitle, recs } of recsBySeed) {
    for (const r of recs) {
      if (!seedMap.has(r.id)) {
        seedMap.set(r.id, []);
        recMap.set(r.id, r);
      }
      const seeds = seedMap.get(r.id)!;
      if (!seeds.includes(seedTitle)) seeds.push(seedTitle);
    }
  }

  return Array.from(recMap.values())
    .filter((r) => !knownTmdbIds.has(r.id) && (r.vote_count ?? 0) >= 100)
    .map((r) => {
      const seedCount = seedMap.get(r.id)?.length ?? 1;
      const base = (r.vote_average ?? 0) * Math.log10((r.popularity ?? 0) + 1);
      const multiSeedBoost = 1 + 0.2 * (seedCount - 1);
      const jitter = 1 + (Math.random() - 0.5) * 0.15;
      return { r, score: base * multiSeedBoost * jitter };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r }) => ({
      tmdbId: r.id,
      title: r.title,
      year: r.release_date ? parseInt(r.release_date.slice(0, 4)) : null,
      posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
      overview: r.overview || null,
      rating: r.vote_average || null,
      seedTitles: seedMap.get(r.id) ?? [],
    }));
}

async function getKnownTmdbIds(userId: string) {
  const existing = await prisma.userMovie.findMany({
    where: { userId },
    include: { movie: { select: { tmdbId: true } } },
  });
  return new Set(existing.map((um) => um.movie.tmdbId));
}

async function getSeedTmdbIds(userId: string): Promise<number[]> {
  const toIds = (movies: { tmdbId: number | null }[]) =>
    [...new Set(movies.map((m) => m.tmdbId).filter((id): id is number => id !== null))];

  const highRated = await prisma.userMovie.findMany({
    where: { userId, watched: true, userRating: { gte: 4 } },
    include: { movie: { select: { tmdbId: true } } },
  });
  if (highRated.length > 0) return toIds(highRated.map((um) => um.movie));

  const watched = await prisma.userMovie.findMany({
    where: { userId, watched: true },
    include: { movie: { select: { tmdbId: true } } },
  });
  if (watched.length > 0) return toIds(watched.map((um) => um.movie));

  const matches = await prisma.match.findMany({
    where: { session: { OR: [{ userId }, { user2Id: userId }] } },
    include: { movie: { select: { tmdbId: true } } },
  });
  if (matches.length > 0) return toIds(matches.map((m) => m.movie));

  const soloSwipes = await prisma.sessionMovie.findMany({
    where: { user1Swipe: 'right', session: { userId, type: 'solo' } },
    include: { movie: { select: { tmdbId: true } } },
    take: 30,
  });
  return toIds(soloSwipes.map((s) => s.movie));
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const seedTmdbIds = await getSeedTmdbIds(userId);

    if (seedTmdbIds.length === 0) {
      res.json({ recommendations: [] });
      return;
    }

    const seedMoviePool = await prisma.movie.findMany({
      where: { tmdbId: { in: seedTmdbIds } },
      select: { tmdbId: true, title: true, genres: true },
    });

    const shuffled = seedMoviePool.sort(() => Math.random() - 0.5);
    const genreCounts = new Map<string, number>();
    const picked: typeof shuffled = [];

    for (const movie of shuffled) {
      if (picked.length >= 10) break;
      const primaryGenre = ((movie.genres as string[])[0]) || 'Unknown';
      const count = genreCounts.get(primaryGenre) ?? 0;
      if (count < 2) {
        picked.push(movie);
        genreCounts.set(primaryGenre, count + 1);
      }
    }
    for (const movie of shuffled) {
      if (picked.length >= 10) break;
      if (!picked.some((p) => p.tmdbId === movie.tmdbId)) picked.push(movie);
    }

    const pickedIds = picked.map((m) => m.tmdbId);
    const seedTitleMap = new Map(picked.map((m) => [m.tmdbId, m.title]));

    const [recsBySeed, knownTmdbIds] = await Promise.all([
      Promise.all(
        pickedIds.map(async (id) => ({
          seedTitle: seedTitleMap.get(id) ?? String(id),
          recs: await getTmdbRecommendations(id),
        }))
      ),
      getKnownTmdbIds(userId),
    ]);

    res.json({ recommendations: scoreAndShape(recsBySeed, knownTmdbIds, 20) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/similar/:tmdbId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tmdbId = parseInt(req.params.tmdbId as string);
    if (isNaN(tmdbId)) {
      res.status(400).json({ error: 'Invalid tmdbId' });
      return;
    }

    const [recs, knownTmdbIds, seedMovie] = await Promise.all([
      getTmdbRecommendations(tmdbId),
      getKnownTmdbIds(req.userId!),
      prisma.movie.findUnique({ where: { tmdbId }, select: { title: true } }),
    ]);

    const seedTitle = seedMovie?.title ?? String(tmdbId);
    res.json({ recommendations: scoreAndShape([{ seedTitle, recs }], knownTmdbIds) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/dismiss/:tmdbId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tmdbId = parseInt(req.params.tmdbId as string);
    if (isNaN(tmdbId)) {
      res.status(400).json({ error: 'Invalid tmdbId' });
      return;
    }

    const movie = await prisma.movie.findUnique({ where: { tmdbId } });
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    await prisma.userMovie.deleteMany({
      where: { userId: req.userId!, movieId: movie.id, source: 'dismissed' },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/dismiss', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { tmdbId } = req.body;
    if (!tmdbId || typeof tmdbId !== 'number') {
      res.status(400).json({ error: 'tmdbId is required' });
      return;
    }

    const movie = await findOrCreateMovieByTmdbId(tmdbId);
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    await prisma.userMovie.upsert({
      where: { userId_movieId: { userId: req.userId!, movieId: movie.id } },
      update: { source: 'dismissed' },
      create: {
        userId: req.userId!,
        movieId: movie.id,
        source: 'dismissed',
        onWatchlist: false,
        watched: false,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
