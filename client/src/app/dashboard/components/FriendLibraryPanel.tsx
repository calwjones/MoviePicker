'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { friendsApi, movieApi } from '@/lib/api';
import MoviePoster from '@/components/MoviePoster';
import InCinemaBadge from '@/components/InCinemaBadge';
import MovieDetailModal from '@/components/MovieDetailModal';
import SkeletonList from '@/components/SkeletonList';
import { DECADE_OPTIONS } from '@/lib/decades';
import type { Movie } from '@shared/types';

type LibFilter = 'watchlist' | 'watched' | 'all';
type SortField = 'dateAdded' | 'year' | 'runtime' | 'tmdbRating' | 'userRating';
type SortDir = 'asc' | 'desc';

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music',
  'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western',
];

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
  const [search, setSearch] = useState('');

  const [showSortFilter, setShowSortFilter] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>('dateAdded');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterGenres, setFilterGenres] = useState<string[]>([]);
  const [filterDecade, setFilterDecade] = useState('');
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterMaxRating, setFilterMaxRating] = useState(10);
  const [filterMaxRuntime, setFilterMaxRuntime] = useState(0);

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

  const hasActiveFilters = filterGenres.length > 0 || filterDecade !== '' || filterMinRating > 0 || filterMaxRating < 10 || filterMaxRuntime > 0;

  const clearAllFilters = () => {
    setFilterGenres([]);
    setFilterDecade('');
    setFilterMinRating(0);
    setFilterMaxRating(10);
    setFilterMaxRuntime(0);
    setSortBy('dateAdded');
    setSortDir('desc');
  };

  const toggleSortField = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'runtime' ? 'asc' : 'desc');
    }
  };

  const filtered = useMemo(() => {
    let result = [...movies];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((um) => um.movie.title.toLowerCase().includes(q));
    }

    if (filterGenres.length > 0) {
      result = result.filter((um) =>
        filterGenres.some((g) => (um.movie.genres as string[]).includes(g)),
      );
    }

    if (filterDecade) {
      const decadeStart = parseInt(filterDecade);
      result = result.filter((um) =>
        um.movie.year != null && um.movie.year >= decadeStart && um.movie.year < decadeStart + 10,
      );
    }

    if (filterMinRating > 0) {
      result = result.filter((um) => (um.movie.tmdbRating ?? 0) >= filterMinRating);
    }
    if (filterMaxRating < 10) {
      result = result.filter((um) => (um.movie.tmdbRating ?? 0) <= filterMaxRating);
    }

    if (filterMaxRuntime > 0) {
      result = result.filter((um) => (um.movie.runtime ?? 0) <= filterMaxRuntime);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'dateAdded':
          cmp = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
          break;
        case 'year':
          cmp = (a.movie.year ?? 0) - (b.movie.year ?? 0);
          break;
        case 'runtime':
          cmp = (a.movie.runtime ?? 999) - (b.movie.runtime ?? 999);
          break;
        case 'tmdbRating':
          cmp = (a.movie.tmdbRating ?? 0) - (b.movie.tmdbRating ?? 0);
          break;
        case 'userRating':
          cmp = (a.userRating ?? 0) - (b.userRating ?? 0);
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [movies, search, filterGenres, filterDecade, filterMinRating, filterMaxRating, filterMaxRuntime, sortBy, sortDir]);

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
          className="max-w-5xl mx-auto px-6 py-8 lg:px-12 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-coral/20 flex items-center justify-center text-coral font-semibold shrink-0">
                {friend.username.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-lg font-semibold truncate">@{friend.username}</h2>
            </div>
            <button
              onClick={onClose}
              className="text-cream-dim hover:text-cream transition-colors text-sm px-3 py-1.5 glass rounded-lg"
            >
              Close
            </button>
          </div>

          {/* Sort & Filter drawer */}
          <div className="glass rounded-2xl p-4">
            <button
              onClick={() => setShowSortFilter(!showSortFilter)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Sort & Filter</h3>
                {hasActiveFilters && (
                  <span className="w-2 h-2 rounded-full bg-coral" />
                )}
              </div>
              <div className="flex items-center gap-3">
                {showSortFilter && hasActiveFilters && (
                  <button
                    onClick={(e) => { e.stopPropagation(); clearAllFilters(); }}
                    className="text-danger text-xs hover:underline"
                  >
                    Clear all
                  </button>
                )}
                <span className="text-cream-dim text-sm">
                  {showSortFilter ? 'Hide' : 'Show'}
                </span>
              </div>
            </button>

            <AnimatePresence>
              {showSortFilter && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-4 space-y-4">
                    <div>
                      <label className="text-cream-dim text-xs mb-2 block uppercase tracking-wider">Sort by</label>
                      <div className="flex flex-wrap gap-2">
                        {([
                          ['dateAdded', 'Date Added'],
                          ['year', 'Release Year'],
                          ['runtime', 'Runtime'],
                          ['tmdbRating', 'TMDb Rating'],
                          ['userRating', 'Their Rating'],
                        ] as [SortField, string][]).map(([field, label]) => (
                          <button
                            key={field}
                            onClick={() => toggleSortField(field)}
                            className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 hover:shadow-md flex items-center gap-1 ${
                              sortBy === field
                                ? 'bg-coral text-charcoal shadow-coral/20'
                                : 'glass text-cream-dim shadow-sm'
                            }`}
                          >
                            {label}
                            {sortBy === field && (
                              <span className="text-[10px]">{sortDir === 'desc' ? '↓' : '↑'}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-cream-dim text-xs mb-2 block uppercase tracking-wider">Genres</label>
                      <div className="flex flex-wrap gap-2">
                        {GENRE_OPTIONS.map((genre) => (
                          <button
                            key={genre}
                            onClick={() => setFilterGenres((prev) =>
                              prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
                            )}
                            className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 hover:shadow-md ${
                              filterGenres.includes(genre)
                                ? 'bg-coral text-charcoal shadow-coral/20'
                                : 'glass text-cream-dim shadow-sm'
                            }`}
                          >
                            {genre}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-cream-dim text-xs mb-2 block uppercase tracking-wider">Decade</label>
                      <div className="flex flex-wrap gap-2">
                        {DECADE_OPTIONS.map((decade) => (
                          <button
                            key={decade}
                            onClick={() => setFilterDecade((prev) => (prev === decade ? '' : decade))}
                            className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 hover:shadow-md ${
                              filterDecade === decade
                                ? 'bg-coral text-charcoal shadow-coral/20'
                                : 'glass text-cream-dim shadow-sm'
                            }`}
                          >
                            {decade}s
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-cream-dim text-xs mb-2 block uppercase tracking-wider">
                        TMDb Rating: {filterMinRating > 0 || filterMaxRating < 10
                          ? `${filterMinRating} – ${filterMaxRating}`
                          : 'Any'}
                      </label>
                      <div className="flex items-center gap-3">
                        <span className="text-cream-dim text-xs w-6">{filterMinRating}</span>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="0.5"
                          value={filterMinRating}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setFilterMinRating(Math.min(v, filterMaxRating));
                          }}
                          className="flex-1 accent-coral"
                        />
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="0.5"
                          value={filterMaxRating}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setFilterMaxRating(Math.max(v, filterMinRating));
                          }}
                          className="flex-1 accent-coral"
                        />
                        <span className="text-cream-dim text-xs w-6">{filterMaxRating}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-cream-dim text-xs mb-2 block uppercase tracking-wider">
                        Max Runtime: {filterMaxRuntime > 0 ? `${filterMaxRuntime} min` : 'Any'}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="240"
                        step="15"
                        value={filterMaxRuntime}
                        onChange={(e) => setFilterMaxRuntime(parseInt(e.target.value))}
                        className="w-full accent-coral"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 gap-3">
              <h3 className="text-sm font-semibold">
                {filter === 'watchlist' ? 'Watchlist' : filter === 'watched' ? 'Watched' : 'All Movies'}
              </h3>
              <span className="text-cream-dim text-sm whitespace-nowrap">
                {hasActiveFilters || search
                  ? `${filtered.length} of ${movies.length}`
                  : movies.length} movies
              </span>
            </div>

            <div className="flex gap-2 mb-3">
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

            {movies.length > 5 && (
              <div className="relative mb-3">
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-4 py-2 pl-9 glass rounded-lg bg-transparent text-cream text-sm placeholder:text-cream-dim focus:outline-none focus:ring-1 focus:ring-coral"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            )}

            {loading ? (
              <SkeletonList count={6} />
            ) : filtered.length === 0 ? (
              <p className="text-cream-dim text-sm text-center py-8">
                {movies.length === 0
                  ? (filter === 'watchlist'
                      ? `@${friend.username} has no movies on their watchlist.`
                      : filter === 'watched'
                        ? `@${friend.username} hasn't marked anything as watched.`
                        : `@${friend.username}'s library is empty.`)
                  : `No matches${search ? ` for "${search}"` : ''}.`}
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                {filtered.map((um) => (
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
