import { Router, Response } from 'express';
import { prisma } from '../app';
import { authenticate, AuthRequest } from '../middleware/auth';
import { searchMovies, findOrCreateMovieByTmdbId, TMDB_IMAGE_BASE } from '../services/tmdb';
import { getInCinemaIds, attachInCinema } from '../services/cinemaStatus';


const router = Router();

router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query || query.trim().length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const [{ results, totalPages }, inCinemaSet] = await Promise.all([
      searchMovies(query.trim(), page),
      getInCinemaIds(),
    ]);

    const movies = results.map((r) => ({
      tmdbId: r.id,
      title: r.title,
      year: r.release_date ? parseInt(r.release_date.slice(0, 4)) : null,
      posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
      overview: r.overview || null,
      rating: r.vote_average || null,
      inCinema: inCinemaSet.has(r.id),
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

    const inCinemaSet = await getInCinemaIds();
    res.json({ movie: attachInCinema(movie, inCinemaSet) });
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
    if (filter === 'dismissed') {
      where.source = 'dismissed';
    } else {
      where.source = { not: 'dismissed' };
      if (filter === 'watchlist') where.onWatchlist = true;
      if (filter === 'watched') where.watched = true;
    }

    const [userMovies, inCinemaSet] = await Promise.all([
      prisma.userMovie.findMany({
        where,
        include: { movie: true },
        orderBy: { createdAt: 'desc' },
      }),
      getInCinemaIds(),
    ]);

    const decorated = userMovies.map((um) => ({
      ...um,
      movie: attachInCinema(um.movie, inCinemaSet),
    }));

    res.json({ movies: decorated });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/pool-size', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const size = await prisma.userMovie.count({
      where: { userId: req.userId!, onWatchlist: true },
    });
    res.json({ size });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:movieId/watched', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { watched } = req.body;
    const [userMovie, inCinemaSet] = await Promise.all([
      prisma.userMovie.update({
        where: { userId_movieId: { userId: req.userId!, movieId: req.params.movieId as string } },
        data: {
          watched: !!watched,
          ...(watched ? { onWatchlist: false } : {}),
        },
        include: { movie: true },
      }),
      getInCinemaIds(),
    ]);
    res.json({ userMovie: { ...userMovie, movie: attachInCinema(userMovie.movie, inCinemaSet) } });
  } catch {
    res.status(500).json({ error: 'Failed to update watched status' });
  }
});

router.post('/:movieId/rate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rating } = req.body;
    const [userMovie, inCinemaSet] = await Promise.all([
      prisma.userMovie.update({
        where: { userId_movieId: { userId: req.userId!, movieId: req.params.movieId as string } },
        data: {
          userRating: typeof rating === 'number' ? rating : null,
          ...(typeof rating === 'number' ? { watched: true, onWatchlist: false } : {}),
        },
        include: { movie: true },
      }),
      getInCinemaIds(),
    ]);
    res.json({ userMovie: { ...userMovie, movie: attachInCinema(userMovie.movie, inCinemaSet) } });
  } catch {
    res.status(500).json({ error: 'Failed to rate movie' });
  }
});

router.get('/tmdb/:tmdbId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tmdbId = parseInt(req.params.tmdbId as string);
    if (isNaN(tmdbId)) {
      res.status(400).json({ error: 'Invalid tmdbId' });
      return;
    }
    const movie = await findOrCreateMovieByTmdbId(tmdbId);
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }
    const inCinemaSet = await getInCinemaIds();
    res.json({ movie: attachInCinema(movie, inCinemaSet) });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const movieId = req.params.id as string;
    const [movie, inCinemaSet] = await Promise.all([
      prisma.movie.findUnique({ where: { id: movieId } }),
      getInCinemaIds(),
    ]);

    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    res.json({ movie: attachInCinema(movie, inCinemaSet) });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
