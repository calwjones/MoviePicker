'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { movieApi, recommendationApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import LoadingSpinner from '@/components/LoadingSpinner';
import MoviePoster from '@/components/MoviePoster';
import ConfirmModal from '@/components/ConfirmModal';
import StarRating from '@/components/StarRating';
import StreamingProvidersList from '@/components/StreamingProviders';
import type { Couple, Movie, UserMovie, SearchResult } from '@shared/types';

interface LibraryTabProps {
  couple: Couple | null;
  addToast: (message: string) => void;
}

export default function LibraryTab({ couple, addToast }: LibraryTabProps) {
  // Library state
  const [watchlist, setWatchlist] = useState<UserMovie[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<'watchlist' | 'watched' | 'all'>('watchlist');
  const [watchlistFilter, setWatchlistFilter] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(SearchResult & { _added?: boolean })[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingTmdbId, setAddingTmdbId] = useState<number | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Movie detail modal
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedUserMovie, setSelectedUserMovie] = useState<UserMovie | null>(null);

  // Remove confirmation modal
  const [removeMovieId, setRemoveMovieId] = useState<string | null>(null);

  // Recommendations
  const [recommendations, setRecommendations] = useState<SearchResult[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  // Load watchlist on mount and when filter changes
  const loadWatchlist = useCallback(async (filter?: 'watchlist' | 'watched' | 'all') => {
    setLibraryLoading(true);
    try {
      const f = filter || libraryFilter;
      const res = await movieApi.mine(f === 'all' ? undefined : f);
      setWatchlist(res.data.movies);
    } catch {
      addToast('Failed to load movies');
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryFilter, addToast]);

  useEffect(() => {
    loadWatchlist();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedMovie) {
        setSelectedMovie(null);
        setSelectedUserMovie(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedMovie]);

  // Lock body scroll when movie sheet is open
  useEffect(() => {
    if (selectedMovie) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedMovie]);

  const loadRecommendations = async () => {
    setRecsLoading(true);
    try {
      const res = await recommendationApi.get();
      setRecommendations(res.data.recommendations || []);
    } catch {
      // ignore
    } finally {
      setRecsLoading(false);
    }
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await movieApi.search(query);
        setSearchResults(res.data.movies);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const handleAddMovie = async (tmdbId: number) => {
    setAddingTmdbId(tmdbId);
    try {
      await movieApi.add(tmdbId);
      setSearchResults((prev) =>
        prev.map((m) => (m.tmdbId === tmdbId ? { ...m, _added: true } : m))
      );
      loadWatchlist();
    } catch {
      // ignore
    } finally {
      setAddingTmdbId(null);
    }
  };

  const handleRemoveFromWatchlist = async (movieId: string) => {
    try {
      await movieApi.removeFromWatchlist(movieId);
      setWatchlist((prev) => prev.filter((um) => um.movieId !== movieId));
      setRemoveMovieId(null);
    } catch {
      addToast('Failed to remove movie');
    }
  };

  const handleAddRecommendation = async (rec: SearchResult) => {
    try {
      await movieApi.add(rec.tmdbId);
      setRecommendations((prev) => prev.filter((r) => r.tmdbId !== rec.tmdbId));
      loadWatchlist();
      addToast(`Added "${rec.title}" to your watchlist`);
    } catch {
      // ignore
    }
  };

  const handleToggleWatched = async (um: UserMovie) => {
    try {
      const res = await movieApi.markWatched(um.movieId, !um.watched);
      const updated = res.data.userMovie;
      setWatchlist((prev) =>
        prev.map((item) => (item.id === um.id ? { ...item, watched: updated.watched } : item))
      );
      setSelectedUserMovie((prev) =>
        prev?.id === um.id ? { ...prev, watched: updated.watched } : prev
      );
      addToast(updated.watched ? 'Marked as watched' : 'Marked as unwatched');
    } catch {
      addToast('Failed to update');
    }
  };

  const handleRateMovie = async (um: UserMovie, rating: number) => {
    // Convert 5-star scale to 0-10
    const ratingValue = rating > 0 ? rating : null;
    try {
      const res = await movieApi.rate(um.movieId, ratingValue);
      const updated = res.data.userMovie;
      setWatchlist((prev) =>
        prev.map((item) =>
          item.id === um.id
            ? { ...item, userRating: updated.userRating, watched: updated.watched }
            : item
        )
      );
      setSelectedUserMovie((prev) =>
        prev?.id === um.id
          ? { ...prev, userRating: updated.userRating, watched: updated.watched }
          : prev
      );
    } catch {
      addToast('Failed to rate');
    }
  };

  // Filter watchlist by search
  const filteredWatchlist = watchlistFilter
    ? watchlist.filter((um) =>
        um.movie.title.toLowerCase().includes(watchlistFilter.toLowerCase())
      )
    : watchlist;

  return (
    <motion.div
      key="library"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-4"
    >
      {/* Library sub-filters */}
      <div className="flex gap-2">
        {(['watchlist', 'watched', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              setLibraryFilter(f);
              loadWatchlist(f);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              libraryFilter === f ? 'bg-amber text-charcoal' : 'glass text-cream-dim'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* For You Recommendations */}
      {couple?.user2 && (
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-amber uppercase tracking-wider">For You</h3>
            <button
              onClick={loadRecommendations}
              disabled={recsLoading}
              className="text-cream-dim text-xs hover:text-cream transition-colors"
            >
              {recsLoading ? 'Loading...' : recommendations.length > 0 ? 'Refresh' : 'Get Recommendations'}
            </button>
          </div>
          {recommendations.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
              {recommendations.map((rec) => (
                <div
                  key={rec.tmdbId}
                  className="flex-shrink-0 w-28 snap-start"
                >
                  <div className="w-28 h-40 rounded-xl overflow-hidden bg-card mb-2">
                    <MoviePoster posterUrl={rec.posterUrl} title={rec.title} />
                  </div>
                  <p className="text-xs font-medium truncate">{rec.title}</p>
                  <p className="text-cream-dim text-[10px]">
                    {rec.year}{rec.rating ? ` · ${rec.rating.toFixed(1)}★` : ''}
                  </p>
                  <button
                    onClick={() => handleAddRecommendation(rec)}
                    className="text-amber text-[10px] hover:underline mt-0.5"
                  >
                    + Add to Watchlist
                  </button>
                </div>
              ))}
            </div>
          ) : !recsLoading ? (
            <p className="text-cream-dim text-xs">Complete swipe sessions to get personalised recommendations based on your matches.</p>
          ) : (
            <div className="flex items-center justify-center py-4">
              <LoadingSpinner size="sm" />
            </div>
          )}
        </div>
      )}

      {/* Search bar */}
      <div className="glass rounded-2xl p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search for a movie to add..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-4 py-3 pl-10 glass rounded-xl bg-transparent text-cream placeholder:text-cream-dim focus:outline-none focus:ring-2 focus:ring-amber"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cream-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <LoadingSpinner size="sm" />
            </div>
          )}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
            {searchResults.map((movie) => (
              <div
                key={movie.tmdbId}
                className="flex items-center gap-3 p-3 glass rounded-xl hover:bg-card-hover transition-colors"
              >
                <div className="w-12 h-18 rounded-lg overflow-hidden bg-card flex-shrink-0">
                  <MoviePoster posterUrl={movie.posterUrl} title={movie.title} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{movie.title}</p>
                  <p className="text-cream-dim text-xs">
                    {movie.year}{movie.rating ? ` · ${movie.rating.toFixed(1)}` : ''}
                  </p>
                  {movie.overview && (
                    <p className="text-cream-dim text-xs mt-1 line-clamp-2">{movie.overview}</p>
                  )}
                </div>
                <button
                  onClick={() => handleAddMovie(movie.tmdbId)}
                  disabled={addingTmdbId === movie.tmdbId || !!movie._added}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 ${
                    movie._added
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-amber text-charcoal hover:bg-amber-dark'
                  }`}
                >
                  {addingTmdbId === movie.tmdbId ? '...' : movie._added ? 'Added' : '+ Add'}
                </button>
              </div>
            ))}
          </div>
        )}

        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
          <p className="text-cream-dim text-sm text-center mt-3">No movies found</p>
        )}
      </div>

      {/* Watchlist with search/filter */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold font-display">
            {libraryFilter === 'watchlist' ? 'Your Watchlist' : libraryFilter === 'watched' ? 'Watched' : 'All Movies'}
          </h2>
          <span className="text-cream-dim text-sm">{watchlist.length} movies</span>
        </div>

        {/* Watchlist search */}
        {watchlist.length > 5 && (
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Filter watchlist..."
              value={watchlistFilter}
              onChange={(e) => setWatchlistFilter(e.target.value)}
              className="w-full px-4 py-2 pl-9 glass rounded-lg bg-transparent text-cream text-sm placeholder:text-cream-dim focus:outline-none focus:ring-1 focus:ring-amber"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        )}

        {libraryLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        ) : watchlist.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-cream-dim mb-2">Your watchlist is empty</p>
            <p className="text-cream-dim text-sm">Search for movies above or import from Letterboxd</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filteredWatchlist.map((um) => (
              <div
                key={um.id}
                className="relative group cursor-pointer"
                onClick={() => { setSelectedMovie(um.movie); setSelectedUserMovie(um); }}
              >
                <div className="aspect-[2/3] rounded-xl overflow-hidden bg-card">
                  <MoviePoster posterUrl={um.movie.posterUrl} title={um.movie.title} />
                  <div className="absolute inset-0 bg-charcoal/0 group-hover:bg-charcoal/60 transition-colors flex items-center justify-center lg:opacity-0 lg:group-hover:opacity-100 opacity-100 bg-charcoal/40 sm:bg-transparent">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRemoveMovieId(um.movieId);
                      }}
                      className="px-2 py-1 bg-danger/80 text-cream text-xs rounded-lg shadow-sm"
                    >
                      Remove
                    </button>
                  </div>
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

        {watchlistFilter && filteredWatchlist.length === 0 && watchlist.length > 0 && (
          <p className="text-cream-dim text-sm text-center mt-3">No matches for &quot;{watchlistFilter}&quot;</p>
        )}
      </div>

      {/* Remove confirmation modal */}
      <ConfirmModal
        open={!!removeMovieId}
        onClose={() => setRemoveMovieId(null)}
        onConfirm={() => removeMovieId && handleRemoveFromWatchlist(removeMovieId)}
        title="Remove from watchlist?"
        description="This movie will be removed from your watchlist."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        danger
      />

      {/* Movie Detail Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal/80 z-50 flex items-end sm:items-center justify-center"
            onClick={() => { setSelectedMovie(null); setSelectedUserMovie(null); }}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="glass rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-4 mb-4">
                <div className="w-24 h-36 rounded-xl overflow-hidden flex-shrink-0">
                  <MoviePoster posterUrl={selectedMovie.posterUrl} title={selectedMovie.title} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold font-display">
                    {selectedMovie.title}
                  </h2>
                  <p className="text-cream-dim text-sm mt-1">
                    {selectedMovie.year}
                    {selectedMovie.runtime ? ` · ${selectedMovie.runtime} min` : ''}
                    {selectedMovie.tmdbRating ? ` · ${selectedMovie.tmdbRating.toFixed(1)}` : ''}
                  </p>
                  {selectedMovie.director && (
                    <p className="text-cream-dim text-xs mt-1">Dir. {selectedMovie.director}</p>
                  )}
                  {selectedMovie.genres && selectedMovie.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedMovie.genres.map((g) => (
                        <span key={g} className="text-xs px-2 py-0.5 glass rounded-full text-cream-dim">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {selectedMovie.overview && (
                <p className="text-cream-dim text-sm mb-4">{selectedMovie.overview}</p>
              )}

              {selectedMovie.cast && selectedMovie.cast.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-cream-dim mb-1">Cast</p>
                  <p className="text-sm">{selectedMovie.cast.join(', ')}</p>
                </div>
              )}

              {selectedMovie.streamingProviders && selectedMovie.streamingProviders.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-cream-dim mb-2">Available on</p>
                  <StreamingProvidersList providers={selectedMovie.streamingProviders} />
                </div>
              )}

              {/* Watched / Rating actions */}
              {selectedUserMovie && (
                <div className="glass rounded-xl p-4 mb-4 space-y-3">
                  <button
                    onClick={() => handleToggleWatched(selectedUserMovie)}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      selectedUserMovie.watched
                        ? 'bg-success/20 text-success'
                        : 'glass text-cream-dim hover:text-cream'
                    }`}
                  >
                    {selectedUserMovie.watched ? 'Watched' : 'Mark as Watched'}
                  </button>
                  <div>
                    <p className="text-xs text-cream-dim mb-2">Your Rating</p>
                    <StarRating
                      value={selectedUserMovie.userRating ?? 0}
                      onChange={(rating) => handleRateMovie(selectedUserMovie, rating)}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={() => { setSelectedMovie(null); setSelectedUserMovie(null); }}
                className="w-full py-3 glass rounded-xl text-cream-dim hover:text-cream transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
