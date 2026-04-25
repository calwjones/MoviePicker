'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { SessionMovie } from '@matchsticked/shared';
import SkeletonCard from '@/components/SkeletonCard';
import MoviePoster from '@/components/MoviePoster';
import MovieDetailModal from '@/components/MovieDetailModal';
import SwipeCard, { type SwipeCardHandle } from '@/components/SwipeCard';
import InCinemaBadge from '@/components/InCinemaBadge';

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
  onExpand?: (movie: SessionMovie['movie']) => void;
  detailLoading?: boolean;
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
  onExpand,
  detailLoading,
}: SwipeViewProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<SwipeCardHandle>(null);

  const previousSwipe = useMemo(() => {
    if (undoStack.length === 0) return null;
    const last = undoStack[undoStack.length - 1];
    const movie = movies.find(m => m.movieId === last.movieId);
    if (!movie) return null;
    return { movie, direction: last.direction as 'left' | 'right' };
  }, [undoStack, movies]);

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
      <div className="flex flex-col items-center min-h-dvh px-6 pt-8 pb-12 text-center">
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
    <div className="h-dvh overflow-hidden flex flex-col overscroll-none">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0">
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
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 relative overflow-hidden">

        {/* Previous card — fanned behind left */}
        <AnimatePresence mode="popLayout">
          {previousSwipe && (
            <motion.div
              key={`prev-${previousSwipe.movie.movie.id}`}
              initial={{ opacity: 0, scale: 0.85, rotate: 0, x: '-50%', y: '-50%' }}
              animate={{ opacity: 1, scale: 0.92, rotate: -8, x: '-58%', y: '-52%' }}
              exit={{ opacity: 0, scale: 0.8, x: '-70%', y: '-50%' }}
              transition={{ type: 'spring', stiffness: 200, damping: 22 }}
              className="absolute top-1/2 left-1/2 pointer-events-none w-full max-w-md lg:max-w-lg max-h-full aspect-[2/3] rounded-3xl overflow-hidden"
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
            className="absolute top-1/2 left-1/2 pointer-events-none w-full max-w-md lg:max-w-lg max-h-full aspect-[2/3] rounded-3xl overflow-hidden"
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
        <SwipeCard
          ref={cardRef}
          cardKey={currentMovie.id}
          onSwipe={onSwipe}
          onTap={() => { setExpanded(true); onExpand?.(currentMovie); }}
          enableHaptics
          className="relative w-full max-w-md lg:max-w-lg max-h-full shrink-0 rounded-3xl overflow-hidden shadow-2xl cursor-grab active:cursor-grabbing aspect-[2/3]"
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

          {currentMovie.inCinema && (
            <div className="absolute top-4 left-4 z-10 pointer-events-none">
              <InCinemaBadge />
            </div>
          )}

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
        </SwipeCard>
      </div>

      {/* Error message */}
      {swipeError && (
        <div className="px-6">
          <p className="text-danger text-sm text-center mb-2">{swipeError}</p>
        </div>
      )}

      {/* Movie detail modal */}
      <MovieDetailModal
        movie={currentMovie}
        open={expanded}
        loading={detailLoading}
        onClose={() => setExpanded(false)}
      />

      {/* Bottom buttons */}
      <div className="px-4 py-3 flex gap-3 items-center w-full max-w-md lg:max-w-lg mx-auto shrink-0">
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
          onClick={() => cardRef.current?.swipe('left')}
          disabled={swiping}
          className="flex-1 py-4 glass rounded-xl text-danger text-lg font-semibold disabled:opacity-50"
        >
          &#10005;
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => cardRef.current?.swipe('right')}
          disabled={swiping}
          className="flex-1 py-4 bg-coral text-charcoal rounded-xl text-lg font-semibold hover:bg-coral-dark transition-colors disabled:opacity-50"
        >
          &#10003;
        </motion.button>
      </div>
    </div>
  );
}
