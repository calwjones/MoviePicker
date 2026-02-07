import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { searchMovies, findOrCreateMovieByTmdbId, TMDB_IMAGE_BASE } from '../services/tmdb';


const router = Router();

router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query || query.trim().length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const { results, totalPages } = await searchMovies(query.trim(), page);

    const movies = results.map((r) => ({
      tmdbId: r.id,
      title: r.title,
      year: r.release_date ? parseInt(r.release_date.slice(0, 4)) : null,
      posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
      overview: r.overview || null,
      rating: r.vote_average || null,
    }));

    res.json({ movies, totalPages, page });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.post('/add', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { tmdbId } = req.body;
    if (!tmdbId || typeof tmdbId !== 'number') {
      res.status(400).json({ error: 'tmdbId is required and must be a number' });
      return;
    }

    const movie = await findOrCreateMovieByTmdbId(tmdbId);
    if (!movie) {
      res.status(404).json({ error: 'Movie not found on TMDb' });
      return;
    }

    await prisma.userMovie.upsert({
      where: {
        userId_movieId: { userId: req.userId!, movieId: movie.id },
      },
      update: { onWatchlist: true },
      create: {
        userId: req.userId!,
        movieId: movie.id,
        source: 'manual',
        onWatchlist: true,
      },
    });

    res.json({ movie });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add movie' });
  }
});

router.delete('/:movieId/watchlist', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const movieId = req.params.movieId as string;

    const userMovie = await prisma.userMovie.findUnique({
      where: {
        userId_movieId: { userId: req.userId!, movieId },
      },
    });

    if (!userMovie) {
      res.status(404).json({ error: 'Movie not in your library' });
      return;
    }

    await prisma.userMovie.update({
      where: { id: userMovie.id },
      data: { onWatchlist: false },
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove movie' });
  }
});

router.get('/mine', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filter = req.query.filter as string | undefined;

    const where: Record<string, unknown> = { userId: req.userId! };
    if (filter === 'watchlist') where.onWatchlist = true;
    if (filter === 'watched') where.watched = true;

    const userMovies = await prisma.userMovie.findMany({
      where,
      include: { movie: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ movies: userMovies });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/pool-size', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const couple = await prisma.couple.findFirst({
      where: { OR: [{ user1Id: req.userId! }, { user2Id: req.userId! }] },
    });

    if (!couple || !couple.user2Id) {
      res.json({ size: 0 });
      return;
    }

    const movies = await prisma.userMovie.findMany({
      where: {
        userId: { in: [couple.user1Id, couple.user2Id] },
        onWatchlist: true,
      },
      select: { movieId: true },
    });

    const uniqueIds = new Set(movies.map((m: { movieId: string }) => m.movieId));
    res.json({ size: uniqueIds.size });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:movieId/watched', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { watched } = req.body;
    const userMovie = await prisma.userMovie.update({
      where: { userId_movieId: { userId: req.userId!, movieId: req.params.movieId as string } },
      data: { 
        watched: !!watched,
        ...(!!watched ? { onWatchlist: false } : {})
      },
      include: { movie: true },
    });
    res.json({ userMovie });
  } catch {
    res.status(500).json({ error: 'Failed to update watched status' });
  }
});

router.post('/:movieId/rate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rating } = req.body;
    const userMovie = await prisma.userMovie.update({
      where: { userId_movieId: { userId: req.userId!, movieId: req.params.movieId as string } },
      data: {
        userRating: typeof rating === 'number' ? rating : null,
        ...(typeof rating === 'number' ? { watched: true, onWatchlist: false } : {}),
      },
      include: { movie: true },
    });
    res.json({ userMovie });
  } catch {
    res.status(500).json({ error: 'Failed to rate movie' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const movieId = req.params.id as string;
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
    });

    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    res.json({ movie });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
