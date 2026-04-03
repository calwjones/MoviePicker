import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getTmdbRecommendations, TMDB_IMAGE_BASE } from '../services/tmdb';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // 1. Seed from matched movies — strongest taste signal
    const matches = await prisma.match.findMany({
      where: {
        session: {
          OR: [{ userId }, { user2Id: userId }],
        },
      },
      include: { movie: { select: { tmdbId: true } } },
    });

    let seedTmdbIds: number[] = matches
      .map((m) => m.movie.tmdbId)
      .filter((id): id is number => id !== null);

    // Fall back to solo right-swipes if no group matches yet
    if (seedTmdbIds.length === 0) {
      const soloSwipes = await prisma.sessionMovie.findMany({
        where: {
          user1Swipe: 'right',
          session: { userId, type: 'solo' },
        },
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

    // 2. Pick 3 random seeds so refresh surfaces different results
    const shuffled = [...seedTmdbIds].sort(() => Math.random() - 0.5);
    const seeds = shuffled.slice(0, 3);

    // 3. Exclude movies already in the user's library
    const existing = await prisma.userMovie.findMany({
      where: { userId },
      include: { movie: { select: { tmdbId: true } } },
    });
    const knownTmdbIds = new Set(existing.map((um) => um.movie.tmdbId));

    // 4. Fetch recs from all seeds in parallel, combine and deduplicate
    const allRecs = (await Promise.all(seeds.map(getTmdbRecommendations))).flat();

    const seen = new Set<number>();
    const unique = allRecs.filter((r) => {
      if (seen.has(r.id) || knownTmdbIds.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    // 5. Sort by TMDb popularity to surface well-known movies
    unique.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

    const recommendations = unique.slice(0, 10).map((r) => ({
      tmdbId: r.id,
      title: r.title,
      year: r.release_date ? parseInt(r.release_date.slice(0, 4)) : null,
      posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
      overview: r.overview || null,
      rating: r.vote_average || null,
    }));

    res.json({ recommendations });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
