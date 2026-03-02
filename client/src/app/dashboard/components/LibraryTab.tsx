'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { movieApi, recommendationApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import LoadingSpinner from '@/components/LoadingSpinner';
import SkeletonList from '@/components/SkeletonList';
import MoviePoster from '@/components/MoviePoster';
import ConfirmModal from '@/components/ConfirmModal';
import StarRating from '@/components/StarRating';
import StreamingProvidersList from '@/components/StreamingProviders';
import type { Movie, UserMovie, SearchResult } from '@shared/types';

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music',
  'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western',
];
const DECADE_OPTIONS = ['1970', '1980', '1990', '2000', '2010', '2020'];

type SortField = 'dateAdded' | 'year' | 'runtime' | 'tmdbRating' | 'userRating';
type SortDir = 'asc' | 'desc';

interface LibraryTabProps {
  addToast: (message: string) => void;
}

export default function LibraryTab({ addToast }: LibraryTabProps) {
  // Library state
  const [watchlist, setWatchlist] = useState<UserMovie[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<'watchlist' | 'watched' | 'all'>('watchlist');
  const [watchlistFilter, setWatchlistFilter] = useState('');

  // Sort & filter state
  const [showSortFilter, setShowSortFilter] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>('dateAdded');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterGenres, setFilterGenres] = useState<string[]>([]);
  const [filterDecade, setFilterDecade] = useState('');
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterMaxRating, setFilterMaxRating] = useState(10);
  const [filterMaxRuntime, setFilterMaxRuntime] = useState(0);

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

  // For You recommendations
  const [recommendations, setRecommendations] = useState<SearchResult[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  // Movies Like
  const [moviesLikeSeed, setMoviesLikeSeed] = useState<Movie | null>(null);
  const [moviesLike, setMoviesLike] = useState<SearchResult[]>([]);
  const [moviesLikeLoading, setMoviesLikeLoading] = useState(false);

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

  const loadMoviesLike = async (movie: Movie) => {
    if (!movie.tmdbId) return;
    setMoviesLikeSeed(movie);
    setMoviesLike([]);
    setMoviesLikeLoading(true);
    setSelectedMovie(null);
    setSelectedUserMovie(null);
    try {
      const res = await recommendationApi.similar(movie.tmdbId);
      setMoviesLike(res.data.recommendations || []);
    } catch {
      // ignore
    } finally {
      setMoviesLikeLoading(false);
    }
  };

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
      if (libraryFilter === 'watchlist' && !updated.onWatchlist) {
        setWatchlist((prev) => prev.filter((item) => item.id !== um.id));
      } else if (libraryFilter === 'watched' && !updated.watched) {
        setWatchlist((prev) => prev.filter((item) => item.id !== um.id));
      } else {
        setWatchlist((prev) =>
          prev.map((item) => (item.id === um.id ? { ...item, watched: updated.watched, onWatchlist: updated.onWatchlist } : item))
        );
      }
      
      setSelectedUserMovie((prev) =>
        prev?.id === um.id ? { ...prev, watched: updated.watched, onWatchlist: updated.onWatchlist } : prev
      );
      addToast(updated.watched ? 'Marked as watched' : 'Marked as unwatched');
    } catch {
      addToast('Failed to update');
    }
  };

  const handleRateMovie = async (um: UserMovie, rating: number) => {
    const ratingValue = rating > 0 ? rating : null;
    try {
      const res = await movieApi.rate(um.movieId, ratingValue);
      const updated = res.data.userMovie;
      if (libraryFilter === 'watchlist' && !updated.onWatchlist) {
        setWatchlist((prev) => prev.filter((item) => item.id !== um.id));
      } else {
        setWatchlist((prev) =>
          prev.map((item) =>
            item.id === um.id
              ? { ...item, userRating: updated.userRating, watched: updated.watched, onWatchlist: updated.onWatchlist }
              : item
          )
        );
      }

      setSelectedUserMovie((prev) =>
        prev?.id === um.id
          ? { ...prev, userRating: updated.userRating, watched: updated.watched, onWatchlist: updated.onWatchlist }
          : prev
      );
    } catch {
      addToast('Failed to rate');
    }
  };

  const [visibleCount, setVisibleCount] = useState(30);

  // Reset visible count when any filter/sort changes
  useEffect(() => {
    setVisibleCount(30);
  }, [libraryFilter, watchlistFilter, sortBy, sortDir, filterGenres, filterDecade, filterMinRating, filterMaxRating, filterMaxRuntime]);

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
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      // Smart defaults: newest/highest first except runtime (shortest first)
      setSortDir(field === 'runtime' ? 'asc' : 'desc');
    }
  };

  // Full filter + sort pipeline
  const filteredWatchlist = useMemo(() => {
    let result = [...watchlist];

    // Text search
    if (watchlistFilter) {
      const q = watchlistFilter.toLowerCase();
      result = result.filter(um => um.movie.title.toLowerCase().includes(q));
    }

    // Genre filter
    if (filterGenres.length > 0) {
      result = result.filter(um =>
        filterGenres.some(g => (um.movie.genres as string[]).includes(g))
      );
    }

    // Decade filter
    if (filterDecade) {
      const decadeStart = parseInt(filterDecade);
      result = result.filter(um =>
        um.movie.year != null && um.movie.year >= decadeStart && um.movie.year < decadeStart + 10
      );
    }

    // TMDb rating range
    if (filterMinRating > 0) {
      result = result.filter(um => (um.movie.tmdbRating ?? 0) >= filterMinRating);
    }
    if (filterMaxRating < 10) {
      result = result.filter(um => (um.movie.tmdbRating ?? 0) <= filterMaxRating);
    }

    // Max runtime
    if (filterMaxRuntime > 0) {
      result = result.filter(um => (um.movie.runtime ?? 0) <= filterMaxRuntime);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'dateAdded':
          // API returns newest first — use createdAt if available, otherwise preserve order
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
  }, [watchlist, watchlistFilter, filterGenres, filterDecade, filterMinRating, filterMaxRating, filterMaxRuntime, sortBy, sortDir]);

  const visibleWatchlist = filteredWatchlist.slice(0, visibleCount);
  const hasMore = filteredWatchlist.length > visibleCount;

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
              libraryFilter === f ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
            }`}
          >
            {f}
          </button>
        ))}
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
                {/* Sort */}
                <div>
                  <label className="text-cream-dim text-xs mb-2 block uppercase tracking-wider">Sort by</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['dateAdded', 'Date Added'],
                      ['year', 'Release Year'],
                      ['runtime', 'Runtime'],
                      ['tmdbRating', 'TMDb Rating'],
                      ['userRating', 'Your Rating'],
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

                {/* Genres */}
                <div>
                  <label className="text-cream-dim text-xs mb-2 block uppercase tracking-wider">Genres</label>
                  <div className="flex flex-wrap gap-2">
                    {GENRE_OPTIONS.map((genre) => (
                      <button
                        key={genre}
                        onClick={() => setFilterGenres(prev =>
                          prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
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

                {/* Decade */}
                <div>
                  <label className="text-cream-dim text-xs mb-2 block uppercase tracking-wider">Decade</label>
                  <div className="flex flex-wrap gap-2">
                    {DECADE_OPTIONS.map((decade) => (
                      <button
                        key={decade}
                        onClick={() => setFilterDecade(prev => prev === decade ? '' : decade)}
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

                {/* TMDb Rating range */}
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

                {/* Max Runtime */}
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

      {/* For You Recommendations */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-danger uppercase tracking-wider">For You</h3>
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
                className="flex-shrink-0 w-28 snap-start group"
              >
                <div className="w-28 aspect-[2/3] rounded-xl overflow-hidden bg-card mb-2 shadow-lg group-hover:shadow-coral/20 transition-all">
                  <MoviePoster posterUrl={rec.posterUrl} title={rec.title} />
                </div>
                <p className="text-xs font-medium truncate">{rec.title}</p>
                <p className="text-cream-dim text-[10px]">
                  {rec.year}{rec.rating ? ` · ${rec.rating.toFixed(1)}★` : ''}
                </p>
                <button
                  onClick={() => handleAddRecommendation(rec)}
                  className="text-danger text-[10px] hover:underline mt-0.5"
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

      {/* Movies Like */}
      <AnimatePresence>
        {(moviesLikeSeed || moviesLikeLoading) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-danger uppercase tracking-wider">
                Movies Like{moviesLikeSeed ? ` ${moviesLikeSeed.title}` : ''}
              </h3>
              <button
                onClick={() => { setMoviesLikeSeed(null); setMoviesLike([]); }}
                className="text-cream-dim text-xs hover:text-cream transition-colors"
              >
                Clear
              </button>
            </div>
            {moviesLikeLoading ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner size="sm" />
              </div>
            ) : moviesLike.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                {moviesLike.map((rec) => (
                  <div key={rec.tmdbId} className="flex-shrink-0 w-28 snap-start group">
                    <div className="w-28 aspect-[2/3] rounded-xl overflow-hidden bg-card mb-2 shadow-lg group-hover:shadow-coral/20 transition-all">
                      <MoviePoster posterUrl={rec.posterUrl} title={rec.title} />
                    </div>
                    <p className="text-xs font-medium truncate">{rec.title}</p>
                    <p className="text-cream-dim text-[10px]">
                      {rec.year}{rec.rating ? ` · ${rec.rating.toFixed(1)}★` : ''}
                    </p>
                    <button
                      onClick={() => handleAddRecommendation(rec)}
                      className="text-danger text-[10px] hover:underline mt-0.5"
                    >
                      + Add to Watchlist
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-cream-dim text-xs">No recommendations found for this movie.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search bar */}
      <div className="glass rounded-2xl p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search for a movie to add..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-4 py-3 pl-10 glass rounded-xl bg-transparent text-cream placeholder:text-cream-dim focus:outline-none focus:ring-2 focus:ring-coral"
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
                className="flex items-center gap-3 p-3 glass rounded-xl hover:bg-card-hover transition-all btn-glow cursor-pointer"
              >
                <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden bg-card flex-shrink-0 shadow-md">
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
                      : 'bg-coral text-charcoal hover:bg-coral-dark'
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
          <span className="text-cream-dim text-sm">
            {hasActiveFilters || watchlistFilter
              ? `${filteredWatchlist.length} of ${watchlist.length}`
              : watchlist.length} movies
          </span>
        </div>

        {/* Watchlist search */}
        {watchlist.length > 5 && (
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Filter watchlist..."
              value={watchlistFilter}
              onChange={(e) => setWatchlistFilter(e.target.value)}
              className="w-full px-4 py-2 pl-9 glass rounded-lg bg-transparent text-cream text-sm placeholder:text-cream-dim focus:outline-none focus:ring-1 focus:ring-coral"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        )}

        {libraryLoading ? (
          <SkeletonList count={6} />
        ) : watchlist.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-cream-dim mb-2">Your watchlist is empty</p>
            <p className="text-cream-dim text-sm">Search for movies above or import from Letterboxd</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {visibleWatchlist.map((um) => (
              <div
                key={um.id}
                className="relative group cursor-pointer"
                onClick={() => { setSelectedMovie(um.movie); setSelectedUserMovie(um); }}
              >
                <div className="aspect-[2/3] rounded-xl overflow-hidden bg-card transition-all duration-200 group-hover:ring-2 group-hover:ring-coral/50 group-hover:scale-[1.03] group-hover:shadow-lg group-hover:shadow-coral/10">
                  <MoviePoster posterUrl={um.movie.posterUrl} title={um.movie.title} />
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

        {hasMore && (
          <button
            onClick={() => setVisibleCount((prev) => prev + 30)}
            className="w-full mt-3 py-2 glass rounded-xl text-cream-dim text-sm hover:bg-card-hover transition-colors"
          >
            Show more ({filteredWatchlist.length - visibleCount} remaining)
          </button>
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
            className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center transition-all"
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

              {selectedMovie.tmdbId && (
                <button
                  onClick={() => loadMoviesLike(selectedMovie)}
                  className="w-full py-2.5 mb-3 glass rounded-xl text-sm text-cream-dim hover:text-cream transition-colors"
                >
                  Movies Like This
                </button>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setSelectedMovie(null); setSelectedUserMovie(null); }}
                  className="flex-1 py-3 glass rounded-xl text-cream-dim hover:text-cream transition-colors"
                >
                  Close
                </button>
                {selectedUserMovie && (
                  <button
                    onClick={() => {
                      setRemoveMovieId(selectedUserMovie.movieId);
                      setSelectedMovie(null);
                      setSelectedUserMovie(null);
                    }}
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
    </motion.div>
  );
}
