import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getTmdbRecommendations, TMDB_IMAGE_BASE } from '../services/tmdb';

const router = Router();

function scoreAndShape(recs: Awaited<ReturnType<typeof getTmdbRecommendations>>, knownTmdbIds: Set<number | null>, limit = 10) {
  return recs
    .filter((r) => !knownTmdbIds.has(r.id) && (r.vote_count ?? 0) >= 100)
    .map((r) => ({ r, score: (r.vote_average ?? 0) * Math.log10((r.popularity ?? 0) + 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r }) => ({
      tmdbId: r.id,
      title: r.title,
      year: r.release_date ? parseInt(r.release_date.slice(0, 4)) : null,
      posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
      overview: r.overview || null,
      rating: r.vote_average || null,
    }));
}

async function getKnownTmdbIds(userId: string) {
  const existing = await prisma.userMovie.findMany({
    where: { userId },
    include: { movie: { select: { tmdbId: true } } },
  });
  return new Set(existing.map((um) => um.movie.tmdbId));
}

// For You — seeded from the user's matches / solo right-swipes
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const matches = await prisma.match.findMany({
      where: { session: { OR: [{ userId }, { user2Id: userId }] } },
      include: { movie: { select: { tmdbId: true } } },
    });

    let seedTmdbIds: number[] = matches
      .map((m) => m.movie.tmdbId)
      .filter((id): id is number => id !== null);

    if (seedTmdbIds.length === 0) {
      const soloSwipes = await prisma.sessionMovie.findMany({
        where: { user1Swipe: 'right', session: { userId, type: 'solo' } },
        include: { movie: { select: { tmdbId: true } } },
        take: 30,
      });
      seedTmdbIds = soloSwipes
        .map((s) => s.movie.tmdbId)
        .filter((id): id is number => id !== null);
    }

    if (seedTmdbIds.length === 0) {
      res.json({ recommendations: [] });
      return;
    }

    const seeds = [...seedTmdbIds].sort(() => Math.random() - 0.5).slice(0, 3);
    const [allRecs, knownTmdbIds] = await Promise.all([
      Promise.all(seeds.map(getTmdbRecommendations)).then((r) => r.flat()),
      getKnownTmdbIds(userId),
    ]);

    const seen = new Set<number>();
    const unique = allRecs.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    res.json({ recommendations: scoreAndShape(unique, knownTmdbIds) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Movies Like — seeded from a specific movie chosen by the user
router.get('/similar/:tmdbId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tmdbId = parseInt(req.params.tmdbId as string);
    if (isNaN(tmdbId)) {
      res.status(400).json({ error: 'Invalid tmdbId' });
      return;
    }

    const [recs, knownTmdbIds] = await Promise.all([
      getTmdbRecommendations(tmdbId),
      getKnownTmdbIds(req.userId!),
    ]);

    res.json({ recommendations: scoreAndShape(recs, knownTmdbIds) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
