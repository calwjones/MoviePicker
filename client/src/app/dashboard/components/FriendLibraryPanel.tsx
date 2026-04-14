'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { friendsApi, movieApi } from '@/lib/api';
import MoviePoster from '@/components/MoviePoster';
import InCinemaBadge from '@/components/InCinemaBadge';
import MovieDetailModal from '@/components/MovieDetailModal';
import SkeletonList from '@/components/SkeletonList';
import type { Movie } from '@shared/types';

type LibFilter = 'watchlist' | 'watched' | 'all';

interface FriendLibraryMovie {
  id: string;
  movieId: string;
  watched: boolean;
  onWatchlist: boolean;
  userRating: number | null;
  createdAt: string;
  movie: Movie;
}

interface Props {
  friend: { id: string; username: string };
  onClose: () => void;
  addToast: (message: string) => void;
}

export default function FriendLibraryPanel({ friend, onClose, addToast }: Props) {
  const [filter, setFilter] = useState<LibFilter>('watchlist');
  const [movies, setMovies] = useState<FriendLibraryMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    friendsApi.library(friend.id, filter)
      .then((res) => {
        if (cancelled) return;
        setMovies(res.data.movies ?? []);
      })
      .catch(() => { if (!cancelled) addToast(`Couldn't load @${friend.username}'s library`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [friend.id, friend.username, filter, addToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  const handleAddToMine = async (movie: Movie) => {
    if (!movie.tmdbId) return;
    setAdding(true);
    try {
      await movieApi.add(movie.tmdbId);
      addToast(`Added "${movie.title}" to your watchlist`);
      setSelected(null);
    } catch {
      addToast('Failed to add');
    } finally {
      setAdding(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-charcoal/95 backdrop-blur-sm overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 24 }}
          animate={{ y: 0 }}
          exit={{ y: 24 }}
          onClick={(e) => e.stopPropagation()}
          className="max-w-5xl mx-auto px-6 py-8 lg:px-12"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-coral/20 flex items-center justify-center text-coral font-semibold shrink-0">
                {friend.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">@{friend.username}</h2>
                <p className="text-cream-dim text-xs">Read-only library view</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-cream-dim hover:text-cream transition-colors text-sm px-3 py-1.5 glass rounded-lg"
            >
              Close
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            {(['watchlist', 'watched', 'all'] as LibFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  filter === f ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="glass rounded-2xl p-4">
            {loading ? (
              <SkeletonList count={6} />
            ) : movies.length === 0 ? (
              <p className="text-cream-dim text-sm text-center py-8">
                {filter === 'watchlist' && `@${friend.username} has no movies on their watchlist.`}
                {filter === 'watched' && `@${friend.username} hasn't marked anything as watched.`}
                {filter === 'all' && `@${friend.username}'s library is empty.`}
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                {movies.map((um) => (
                  <div
                    key={um.id}
                    className="relative group cursor-pointer"
                    onClick={() => setSelected(um.movie)}
                  >
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-card transition-all duration-200 group-hover:ring-2 group-hover:ring-coral/50 group-hover:scale-[1.03]">
                      <MoviePoster posterUrl={um.movie.posterUrl} title={um.movie.title} />
                      {um.movie.inCinema && (
                        <div className="absolute top-1.5 left-1.5">
                          <InCinemaBadge size="sm" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs mt-1 truncate">{um.movie.title}</p>
                    <p className="text-xs text-cream-dim">
                      {um.movie.year}
                      {um.userRating ? ` · ${um.userRating}★` : ''}
                      {um.watched && !um.userRating ? ' · Watched' : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        <MovieDetailModal
          movie={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          onAdd={adding ? undefined : handleAddToMine}
        />
      </motion.div>
    </AnimatePresence>
  );
}
