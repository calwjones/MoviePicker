'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { sessionApi, swipeApi } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';

interface Movie {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  genres: string[];
  director: string | null;
  cast: string[];
  runtime: number | null;
  tmdbRating: number | null;
  streamingProviders: { name: string; type: string; logoUrl: string }[];
}

interface SessionMovie {
  id: string;
  movieId: string;
  movie: Movie;
  user1Swipe: string | null;
  user2Swipe: string | null;
}

export default function SessionPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [movies, setMovies] = useState<SessionMovie[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUser1, setIsUser1] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [partnerProgress, setPartnerProgress] = useState(0);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState(false);
  const [swipeError, setSwipeError] = useState('');
  const [undoStack, setUndoStack] = useState<{ index: number; movieId: string; direction: string }[]>([]);
  const isDragging = useRef(false);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const leftOpacity = useTransform(x, [-200, -50, 0], [1, 0.5, 0]);
  const rightOpacity = useTransform(x, [0, 50, 200], [0, 0.5, 1]);

  useEffect(() => {
    if (!user) {
      router.push('/auth?mode=login');
    }
  }, [user, router]);

  useEffect(() => {
    if (!sessionId || !user) return;

    sessionApi.get(sessionId).then((res) => {
      const { session, isUser1: iu1 } = res.data;
      setIsUser1(iu1);

      const swipeField = iu1 ? 'user1Swipe' : 'user2Swipe';
      const unswiped = session.movies.filter((m: SessionMovie) => m[swipeField] === null);
      const swiped = session.movies.filter((m: SessionMovie) => m[swipeField] !== null);

      setMovies(unswiped);
      setCurrentIndex(0);

      const otherField = iu1 ? 'user2Swipe' : 'user1Swipe';
      const partnerSwiped = session.movies.filter((m: SessionMovie) => m[otherField] !== null).length;
      const total = session.movies.length;
      setPartnerProgress(total > 0 ? Math.round((partnerSwiped / total) * 100) : 0);

      if (unswiped.length === 0 && swiped.length > 0) {
        setDone(true);
      }

      setLoading(false);
    }).catch(() => {
      router.push('/dashboard');
    });
  }, [sessionId, user, router]);

  useEffect(() => {
    if (!sessionId) return;

    connectSocket();
    const socket = getSocket();
    socket.emit('join-session', sessionId);

    socket.on('swipe-update', (data: { progress: number }) => {
      if (data.progress !== undefined) {
        setPartnerProgress(data.progress);
      }
    });

    socket.on('session-complete', () => {
      router.push(`/matches/${sessionId}`);
    });

    socket.on('partner-done', () => {
      setPartnerProgress(100);
    });

    socket.on('partner-online', () => {
      setPartnerOnline(true);
    });

    socket.on('disconnect', () => {
      setPartnerOnline(false);
    });

    socket.on('connect', () => {
      socket.emit('join-session', sessionId);
    });

    return () => {
      socket.off('swipe-update');
      socket.off('session-complete');
      socket.off('partner-done');
      socket.off('partner-online');
      socket.off('disconnect');
      socket.off('connect');
    };
  }, [sessionId, router]);

  const handleSwipe = useCallback(async (direction: 'left' | 'right') => {
    if (currentIndex >= movies.length || swiping) return;

    const movie = movies[currentIndex];
    setSwiping(true);
    setSwipeError('');

    try {
      await swipeApi.swipe(sessionId, movie.movieId, direction);

      setUndoStack((prev) => [...prev.slice(-9), { index: currentIndex, movieId: movie.movieId, direction }]);

      if (currentIndex + 1 >= movies.length) {
        setDone(true);
        const res = await swipeApi.done(sessionId);
        if (res.data.status === 'completed') {
          router.push(`/matches/${sessionId}`);
        }
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    } catch (err) {
      console.error('Swipe failed:', err);
      setSwipeError('Swipe failed — tap to retry');
    } finally {
      setSwiping(false);
      x.set(0);
    }
  }, [currentIndex, movies, sessionId, router, x, swiping]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;

    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    if (done) {
      setDone(false);
    }

    setCurrentIndex(last.index);
  }, [undoStack, done]);

  const handleDragStart = () => {
    isDragging.current = true;
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setTimeout(() => { isDragging.current = false; }, 50);
    const threshold = 100;
    if (info.offset.x > threshold) {
      handleSwipe('right');
    } else if (info.offset.x < -threshold) {
      handleSwipe('left');
    } else {
      x.set(0);
    }
  };

  const handleCardTap = () => {
    if (!isDragging.current) {
      setExpanded(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-amber border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <h2
            className="text-3xl font-bold mb-4"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            All done!
          </h2>
          <p className="text-cream-dim mb-2">Waiting for your partner to finish swiping...</p>
          <div className="w-48 h-2 bg-card rounded-full mx-auto mt-4 overflow-hidden">
            <motion.div
              className="h-full bg-amber rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(partnerProgress, 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-cream-dim text-sm mt-2">Partner: {Math.min(partnerProgress, 100)}%</p>
          {undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              className="mt-4 py-2 px-6 glass rounded-xl text-cream-dim text-sm hover:bg-card-hover transition-colors"
            >
              Undo last swipe
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center">
        <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-playfair)' }}>
          No movies in this session
        </h2>
        <p className="text-cream-dim mb-6">Add some movies to your watchlists first, then start a new session.</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="py-3 px-8 bg-amber text-charcoal font-semibold rounded-xl hover:bg-amber-dark transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const currentMovie = movies[currentIndex]?.movie;
  if (!currentMovie) return null;

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between">
        <button onClick={() => router.push('/dashboard')} className="text-cream-dim text-sm">
          &larr; Back
        </button>
        <span className="text-cream-dim text-sm">
          {currentIndex + 1} / {movies.length}
        </span>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${partnerOnline ? 'bg-success animate-pulse' : 'bg-cream-dim'}`} />
          <span className="text-cream-dim text-xs">Partner: {Math.min(partnerProgress, 100)}%</span>
        </div>
      </div>

      {/* Card stack */}
      <div className="flex-1 flex items-center justify-center px-6 relative" style={{ minHeight: '60dvh' }}>
        {/* Next card preview */}
        {currentIndex + 1 < movies.length && (
          <div className="absolute inset-x-6 rounded-3xl overflow-hidden" style={{ height: '65dvh', transform: 'scale(0.95)', opacity: 0.3 }}>
            <div
              className="w-full h-full bg-cover bg-center bg-card"
              style={movies[currentIndex + 1].movie.posterUrl
                ? { backgroundImage: `url(${movies[currentIndex + 1].movie.posterUrl})` }
                : {}
              }
            >
              {!movies[currentIndex + 1].movie.posterUrl && (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-cream-dim text-lg">{movies[currentIndex + 1].movie.title}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Current card */}
        <motion.div
          key={currentMovie.id}
          style={{ x, rotate, height: '65dvh' }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.8}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className="swipe-card relative w-full rounded-3xl overflow-hidden shadow-2xl cursor-grab active:cursor-grabbing z-10"
        >
          {/* Poster or fallback */}
          {currentMovie.posterUrl ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${currentMovie.posterUrl})` }}
            />
          ) : (
            <div className="absolute inset-0 bg-card flex items-center justify-center p-6">
              <div className="text-center">
                <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-playfair)' }}>{currentMovie.title}</h3>
                <p className="text-cream-dim">{currentMovie.year}</p>
                {currentMovie.tmdbRating && (
                  <p className="text-amber mt-2">&#9733; {currentMovie.tmdbRating.toFixed(1)}</p>
                )}
              </div>
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/40 to-transparent" />

          {/* Tap area for expand — only in bottom half so it doesn't conflict with swipe indicators */}
          <button
            onClick={handleCardTap}
            className="absolute bottom-0 left-0 right-0 h-1/3 z-20"
            aria-label="View details"
          />

          {/* Swipe indicators */}
          <motion.div
            style={{ opacity: rightOpacity }}
            className="absolute top-8 left-6 z-20 px-4 py-2 border-3 border-success rounded-xl"
          >
            <span className="text-success text-2xl font-bold">YES</span>
          </motion.div>
          <motion.div
            style={{ opacity: leftOpacity }}
            className="absolute top-8 right-6 z-20 px-4 py-2 border-3 border-danger rounded-xl"
          >
            <span className="text-danger text-2xl font-bold">NOPE</span>
          </motion.div>

          {/* Movie info */}
          <div className="absolute bottom-0 left-0 right-0 p-6 z-10 pointer-events-none">
            <h2
              className="text-3xl font-bold mb-1 leading-tight"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              {currentMovie.title}
            </h2>
            <div className="flex items-center gap-3 text-cream-dim text-sm mb-3">
              <span>{currentMovie.year}</span>
              {currentMovie.runtime && <span>{currentMovie.runtime} min</span>}
              {currentMovie.tmdbRating && (
                <span className="text-amber">&#9733; {currentMovie.tmdbRating.toFixed(1)}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {(currentMovie.genres as string[]).slice(0, 3).map((genre) => (
                <span key={genre} className="px-2 py-0.5 glass rounded-full text-xs text-cream-dim">
                  {genre}
                </span>
              ))}
            </div>
            <p className="text-cream-dim text-sm line-clamp-2">{currentMovie.overview}</p>
          </div>
        </motion.div>
      </div>

      {/* Error message */}
      {swipeError && (
        <div className="px-6">
          <p className="text-coral text-sm text-center mb-2">{swipeError}</p>
        </div>
      )}

      {/* Expanded detail sheet */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-charcoal overflow-y-auto"
            style={{ touchAction: 'pan-y' }}
          >
            <div className="relative">
              {/* Poster header */}
              <div className="h-[45dvh] relative">
                {currentMovie.posterUrl ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${currentMovie.posterUrl})` }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-card" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/50 to-transparent" />
                <button
                  onClick={() => setExpanded(false)}
                  className="absolute top-6 right-6 z-10 w-10 h-10 glass rounded-full flex items-center justify-center text-cream"
                >
                  &#10005;
                </button>
              </div>

              {/* Details */}
              <div className="px-6 -mt-20 relative z-10 pb-32">
                <h2
                  className="text-3xl font-bold mb-2"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  {currentMovie.title}
                </h2>
                <div className="flex items-center gap-3 text-cream-dim text-sm mb-4">
                  <span>{currentMovie.year}</span>
                  {currentMovie.runtime && <span>{currentMovie.runtime} min</span>}
                  {currentMovie.tmdbRating && (
                    <span className="text-amber">&#9733; {currentMovie.tmdbRating.toFixed(1)}</span>
                  )}
                </div>

                {currentMovie.director && (
                  <p className="text-cream-dim text-sm mb-2">
                    <span className="text-cream">Director:</span> {currentMovie.director}
                  </p>
                )}
                {(currentMovie.cast as string[]).length > 0 && (
                  <p className="text-cream-dim text-sm mb-4">
                    <span className="text-cream">Cast:</span> {(currentMovie.cast as string[]).join(', ')}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mb-4">
                  {(currentMovie.genres as string[]).map((genre) => (
                    <span key={genre} className="px-3 py-1 glass rounded-full text-xs text-cream-dim">
                      {genre}
                    </span>
                  ))}
                </div>

                <p className="text-cream-dim leading-relaxed mb-6">{currentMovie.overview}</p>

                {/* Streaming providers */}
                {(currentMovie.streamingProviders as { name: string; type: string; logoUrl: string }[]).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: 'var(--font-playfair)' }}>
                      Where to Watch (UK)
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {(currentMovie.streamingProviders as { name: string; type: string; logoUrl: string }[]).map((provider, i) => (
                        <div key={i} className="flex items-center gap-2 glass rounded-xl px-3 py-2">
                          <img
                            src={provider.logoUrl}
                            alt={provider.name}
                            className="w-6 h-6 rounded"
                          />
                          <span className="text-sm text-cream-dim">{provider.name}</span>
                          <span className="text-xs text-amber">({provider.type})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Swipe buttons at bottom of detail view */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-charcoal to-transparent">
              <div className="flex gap-4 max-w-sm mx-auto">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setExpanded(false); handleSwipe('left'); }}
                  disabled={swiping}
                  className="flex-1 py-4 glass rounded-xl text-danger text-lg font-semibold disabled:opacity-50"
                >
                  Pass
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setExpanded(false); handleSwipe('right'); }}
                  disabled={swiping}
                  className="flex-1 py-4 bg-amber text-charcoal rounded-xl text-lg font-semibold hover:bg-amber-dark transition-colors disabled:opacity-50"
                >
                  Interested
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom buttons */}
      <div className="px-6 py-4 flex gap-4 items-center">
        {undoStack.length > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleUndo}
            className="w-12 h-12 glass rounded-full flex items-center justify-center text-cream-dim"
            aria-label="Undo"
          >
            &#8630;
          </motion.button>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleSwipe('left')}
          disabled={swiping}
          className="flex-1 py-4 glass rounded-xl text-danger text-lg font-semibold disabled:opacity-50"
        >
          &#10005;
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleSwipe('right')}
          disabled={swiping}
          className="flex-1 py-4 bg-amber text-charcoal rounded-xl text-lg font-semibold hover:bg-amber-dark transition-colors disabled:opacity-50"
        >
          &#10003;
        </motion.button>
      </div>
    </div>
  );
}
