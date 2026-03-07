'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Movie, UserMovie } from '@shared/types';
import MoviePoster from './MoviePoster';
import StreamingProvidersList from './StreamingProviders';
import StarRating from './StarRating';

interface MovieDetailModalProps {
  movie: Movie | null;
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  seedTitles?: string[];

  userMovie?: UserMovie | null;
  onToggleWatched?: (um: UserMovie) => void;
  onRate?: (um: UserMovie, rating: number) => void;
  onRemove?: (um: UserMovie) => void;
  onMoviesLike?: (movie: Movie) => void;

  onAdd?: (movie: Movie) => void | Promise<void>;
  onDismiss?: (movie: Movie) => void | Promise<void>;
}

export default function MovieDetailModal({
  movie,
  open,
  loading,
  onClose,
  seedTitles,
  userMovie,
  onToggleWatched,
  onRate,
  onRemove,
  onMoviesLike,
  onAdd,
  onDismiss,
}: MovieDetailModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  const isRecContext = !!onAdd;
  const isLibraryContext = !!userMovie;

  return (
    <AnimatePresence>
      {open && movie && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="glass rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {seedTitles && seedTitles.length > 0 && (
              <p className="text-xs text-cream-dim mb-3">
                Because you liked{' '}
                {seedTitles.map((t, i) => (
                  <span key={t}>
                    <span className="text-cream">{t}</span>
                    {i < seedTitles.length - 1 ? ' and ' : ''}
                  </span>
                ))}
              </p>
            )}

            <div className="flex gap-4 mb-4">
              <div className="w-24 h-36 rounded-xl overflow-hidden flex-shrink-0">
                <MoviePoster posterUrl={movie.posterUrl} title={movie.title} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold font-display">{movie.title}</h2>
                <p className="text-cream-dim text-sm mt-1">
                  {movie.year}
                  {movie.runtime ? ` · ${movie.runtime} min` : ''}
                  {movie.tmdbRating ? ` · ${movie.tmdbRating.toFixed(1)}★` : ''}
                </p>
                {movie.director && (
                  <p className="text-cream-dim text-xs mt-1">Dir. {movie.director}</p>
                )}
                {movie.genres && movie.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {movie.genres.map((g) => (
                      <span key={g} className="text-xs px-2 py-0.5 glass rounded-full text-cream-dim">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
                {loading && (
                  <p className="text-cream-dim text-xs mt-2 animate-pulse">Loading details…</p>
                )}
              </div>
            </div>

            {movie.overview && (
              <p className="text-cream-dim text-sm mb-4">{movie.overview}</p>
            )}

            {movie.cast && movie.cast.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-cream-dim mb-1">Cast</p>
                <p className="text-sm">{movie.cast.slice(0, 5).join(', ')}</p>
              </div>
            )}

            {movie.streamingProviders && movie.streamingProviders.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-cream-dim mb-2">Available on</p>
                <StreamingProvidersList providers={movie.streamingProviders} />
              </div>
            )}

            {isLibraryContext && userMovie && (
              <div className="glass rounded-xl p-4 mb-4 space-y-3">
                {onToggleWatched && (
                  <button
                    onClick={() => onToggleWatched(userMovie)}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      userMovie.watched
                        ? 'bg-success/20 text-success'
                        : 'glass text-cream-dim hover:text-cream'
                    }`}
                  >
                    {userMovie.watched ? 'Watched' : 'Mark as Watched'}
                  </button>
                )}
                {onRate && (
                  <div>
                    <p className="text-xs text-cream-dim mb-2">Your Rating</p>
                    <StarRating
                      value={userMovie.userRating ?? 0}
                      onChange={(rating) => onRate(userMovie, rating)}
                    />
                  </div>
                )}
              </div>
            )}

            {onMoviesLike && movie.tmdbId && (
              <button
                onClick={() => onMoviesLike(movie)}
                className="w-full py-2.5 mb-3 glass rounded-xl text-sm text-cream-dim hover:text-cream transition-colors"
              >
                Movies Like This
              </button>
            )}

            <div className="flex gap-3">
              {isRecContext && onDismiss ? (
                <button
                  onClick={async () => { await onDismiss(movie); onClose(); }}
                  className="flex-1 py-3 glass rounded-xl text-cream-dim hover:text-coral transition-colors text-sm font-medium"
                >
                  Not interested
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="flex-1 py-3 glass rounded-xl text-cream-dim hover:text-cream transition-colors"
                >
                  Close
                </button>
              )}
              {isRecContext && onAdd && (
                <button
                  onClick={() => onAdd(movie)}
                  className="flex-1 py-3 bg-coral text-charcoal rounded-xl font-medium text-sm hover:bg-coral/90 transition-colors"
                >
                  Add to Watchlist
                </button>
              )}
              {isLibraryContext && userMovie && onRemove && (
                <button
                  onClick={() => onRemove(userMovie)}
                  className="py-3 px-4 glass rounded-xl text-danger text-sm hover:bg-danger/10 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
