'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, animate, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import type { SessionMovie } from '@shared/types';
import SkeletonCard from '@/components/SkeletonCard';
import MoviePoster from '@/components/MoviePoster';
import StreamingProvidersList from '@/components/StreamingProviders';

interface SwipeViewProps {
  movies: SessionMovie[];
  currentIndex: number;
  onSwipe: (direction: 'left' | 'right') => Promise<void>;
  onUndo: () => Promise<void>;
  undoStack: { index: number; movieId: string; direction: string }[];
  swiping: boolean;
  swipeError: string;
  loading: boolean;
  done: boolean;
  headerRight?: React.ReactNode;
  doneContent: React.ReactNode;
}

export default function SwipeView({
  movies,
  currentIndex,
  onSwipe,
  onUndo,
  undoStack,
  swiping,
  swipeError,
  loading,
  done,
  headerRight,
  doneContent,
}: SwipeViewProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const isDragging = useRef(false);
  const lastSwipeDir = useRef<'left' | 'right'>('left');
  const cooldownRef = useRef(false);

  // Derive previous movie from undoStack
  const previousSwipe = useMemo(() => {
    if (undoStack.length === 0) return null;
    const last = undoStack[undoStack.length - 1];
    const movie = movies.find(m => m.movieId === last.movieId);
    if (!movie) return null;
    return { movie, direction: last.direction as 'left' | 'right' };
  }, [undoStack, movies]);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const leftOpacity = useTransform(x, [-200, -50, 0], [1, 0.5, 0]);
  const rightOpacity = useTransform(x, [0, 50, 200], [0, 0.5, 1]);

  const handleSwipeInternal = useCallback(async (direction: 'left' | 'right') => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    lastSwipeDir.current = direction;
    // Animate card off-screen first — consistent visual for buttons, small drags, and full drags
    await animate(x, direction === 'right' ? 400 : -400, { duration: 0.25, ease: 'easeIn' });
    try {
      await onSwipe(direction);
    } finally {
      x.set(0);
      setTimeout(() => { cooldownRef.current = false; }, 100);
    }
  }, [onSwipe, x]);

  const handleDragStart = () => {
    isDragging.current = true;
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setTimeout(() => { isDragging.current = false; }, 50);
    const threshold = 100;
    if (info.offset.x > threshold) {
      try { navigator?.vibrate?.(50); } catch { /* unsupported */ }
      handleSwipeInternal('right');
    } else if (info.offset.x < -threshold) {
      try { navigator?.vibrate?.(50); } catch { /* unsupported */ }
      handleSwipeInternal('left');
    } else {
      x.set(0);
    }
  };

  const handleCardTap = () => {
    if (!isDragging.current) setExpanded(true);
  };

  // Preload the next card's poster image
  useEffect(() => {
    if (currentIndex + 1 < movies.length) {
      const nextPoster = movies[currentIndex + 1]?.movie?.posterUrl;
      if (nextPoster) {
        const img = new Image();
        img.src = nextPoster;
      }
    }
  }, [currentIndex, movies]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh px-4">
        <div className="w-full max-w-md lg:max-w-lg" style={{ height: '70dvh' }}>
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center">
        {doneContent}
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
          className="py-3 px-8 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors"
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
      <div className="px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1.5 text-cream-dim hover:text-cream transition-colors px-3 py-1.5 glass rounded-lg text-sm">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <span className="text-cream-dim text-sm">
          {currentIndex + 1} / {movies.length}
        </span>
        <div className="flex items-center gap-2">
          {headerRight}
        </div>
      </div>

      {/* Card stack area */}
      <div className="flex-1 flex items-center justify-center px-4 relative overflow-hidden">

        {/* Previous card — fanned behind left */}
        <AnimatePresence mode="popLayout">
          {previousSwipe && (
            <motion.div
              key={`prev-${previousSwipe.movie.movie.id}`}
              initial={{ opacity: 0, scale: 0.85, rotate: 0, x: '-50%', y: '-50%' }}
              animate={{ opacity: 1, scale: 0.92, rotate: -8, x: '-58%', y: '-52%' }}
              exit={{ opacity: 0, scale: 0.8, x: '-70%', y: '-50%' }}
              transition={{ type: 'spring', stiffness: 200, damping: 22 }}
              className="absolute top-1/2 left-1/2 pointer-events-none w-full max-w-md lg:max-w-lg aspect-[2/3] rounded-3xl overflow-hidden"
              style={{ transformOrigin: 'bottom center', zIndex: 1 }}
            >
              <div className="absolute inset-0 bg-card">
                <MoviePoster posterUrl={previousSwipe.movie.movie.posterUrl} title="" />
              </div>
              <div className="absolute inset-0 bg-charcoal/60" />
              {/* Verdict badge */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.15 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    previousSwipe.direction === 'right'
                      ? 'bg-success/30 ring-2 ring-success/60'
                      : 'bg-danger/30 ring-2 ring-danger/60'
                  }`}
                  style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
                >
                  {previousSwipe.direction === 'right' ? (
                    <svg className="w-8 h-8 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Next card — fanned behind right */}
        {currentIndex + 1 < movies.length && (
          <div
            className="absolute top-1/2 left-1/2 pointer-events-none w-full max-w-md lg:max-w-lg aspect-[2/3] rounded-3xl overflow-hidden"
            style={{
              transform: 'translate(-42%, -48%) rotate(6deg) scale(0.92)',
              transformOrigin: 'bottom center',
              zIndex: 0,
            }}
          >
            <div className="absolute inset-0 bg-card">
              <MoviePoster posterUrl={movies[currentIndex + 1].movie.posterUrl} title="" />
            </div>
            <div className="absolute inset-0 bg-charcoal/70" />
          </div>
        )}

        {/* Current card with enter/exit animation */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={currentMovie.id}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0, rotate: 0 }}
            exit={{
              opacity: 0,
              transition: { duration: 0.1 },
            }}
            style={{ x, rotate, zIndex: 10 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.8}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            className="swipe-card relative w-full max-w-md lg:max-w-lg shrink-0 rounded-3xl overflow-hidden shadow-2xl cursor-grab active:cursor-grabbing aspect-[2/3]"
          >
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
                    <p className="text-danger mt-2">&#9733; {currentMovie.tmdbRating.toFixed(1)}</p>
                  )}
                </div>
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/40 to-transparent" />

            <button
              onClick={handleCardTap}
              className="absolute bottom-0 left-0 right-0 h-1/3 z-20"
              aria-label="View details"
            />

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
                  <span className="text-danger">&#9733; {currentMovie.tmdbRating.toFixed(1)}</span>
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
        </AnimatePresence>
      </div>

      {/* Error message */}
      {swipeError && (
        <div className="px-6">
          <p className="text-danger text-sm text-center mb-2">{swipeError}</p>
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
            <div className="relative max-w-md lg:max-w-lg mx-auto min-h-dvh bg-charcoal">
              <div className="aspect-[2/3] relative">
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
                    <span className="text-danger">&#9733; {currentMovie.tmdbRating.toFixed(1)}</span>
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

                {(currentMovie.streamingProviders as { name: string; type: string; logoUrl: string }[]).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: 'var(--font-playfair)' }}>
                      Where to Watch
                    </h3>
                    <StreamingProvidersList providers={currentMovie.streamingProviders as { name: string; type: string; logoUrl: string }[]} />
                  </div>
                )}
              </div>
            </div>

            {/* Swipe buttons at bottom of detail view */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-charcoal via-charcoal/80 to-transparent z-20 pointer-events-none">
              <div className="flex gap-4 max-w-sm mx-auto pointer-events-auto">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setExpanded(false); handleSwipeInternal('left'); }}
                  disabled={swiping}
                  className="flex-1 py-4 glass rounded-xl text-danger text-lg font-semibold disabled:opacity-50"
                >
                  Pass
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setExpanded(false); handleSwipeInternal('right'); }}
                  disabled={swiping}
                  className="flex-1 py-4 bg-coral text-charcoal rounded-xl text-lg font-semibold hover:bg-coral-dark transition-colors disabled:opacity-50"
                >
                  Interested
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom buttons */}
      <div className="px-4 py-3 flex gap-3 items-center w-full max-w-md lg:max-w-lg mx-auto">
        {undoStack.length > 0 && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onUndo}
            className="flex items-center gap-1.5 px-4 py-3 glass rounded-xl text-cream-dim text-sm hover:text-cream transition-colors"
            aria-label="Undo"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Undo
          </motion.button>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleSwipeInternal('left')}
          disabled={swiping}
          className="flex-1 py-4 glass rounded-xl text-danger text-lg font-semibold disabled:opacity-50"
        >
          &#10005;
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleSwipeInternal('right')}
          disabled={swiping}
          className="flex-1 py-4 bg-coral text-charcoal rounded-xl text-lg font-semibold hover:bg-coral-dark transition-colors disabled:opacity-50"
        >
          &#10003;
        </motion.button>
      </div>
    </div>
  );
}
