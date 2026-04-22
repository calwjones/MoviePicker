'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { movieApi, recommendationApi, importApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import LoadingSpinner from '@/components/LoadingSpinner';
import SkeletonList from '@/components/SkeletonList';
import MoviePoster from '@/components/MoviePoster';
import InCinemaBadge from '@/components/InCinemaBadge';
import ConfirmModal from '@/components/ConfirmModal';
import RecDetailSheet from '@/components/RecDetailSheet';
import MovieDetailModal from '@/components/MovieDetailModal';
import LetterboxdImport from '@/components/LetterboxdImport';
import LetterboxdResyncButton from '@/components/LetterboxdResyncButton';
import OnboardingSeedGrid from '@/components/OnboardingSeedGrid';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { DECADE_OPTIONS } from '@/lib/decades';
import type { Movie, UserMovie, SearchResult } from '@matchsticked/shared';

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music',
  'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western',
];

type SortField = 'dateAdded' | 'year' | 'runtime' | 'tmdbRating' | 'userRating';
type SortDir = 'asc' | 'desc';

interface LibraryTabProps {
  addToast: (message: string) => void;
}

export default function LibraryTab({ addToast }: LibraryTabProps) {
  const { user } = useAuth();
  const router = useRouter();
  const hasLetterboxd = !!user?.letterboxdUsername;
  const [letterboxdDismissed, setLetterboxdDismissed] = useState(false);
  const [seedGridOpen, setSeedGridOpen] = useState(false);

  useEffect(() => {
    setLetterboxdDismissed(localStorage.getItem('letterboxdImportDismissed') === '1');
  }, []);

  const [watchlist, setWatchlist] = useState<UserMovie[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<'watchlist' | 'watched' | 'all'>('watchlist');
  const [watchlistFilter, setWatchlistFilter] = useState('');

  const [showSortFilter, setShowSortFilter] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>('dateAdded');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterGenres, setFilterGenres] = useState<string[]>([]);
  const [filterDecade, setFilterDecade] = useState('');
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterMaxRating, setFilterMaxRating] = useState(10);
  const [filterMaxRuntime, setFilterMaxRuntime] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(SearchResult & { _added?: boolean })[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingTmdbId, setAddingTmdbId] = useState<number | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedUserMovie, setSelectedUserMovie] = useState<UserMovie | null>(null);
  const [removeMovieId, setRemoveMovieId] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<SearchResult[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  const [moviesLikeSeed, setMoviesLikeSeed] = useState<Movie | null>(null);
  const [moviesLike, setMoviesLike] = useState<SearchResult[]>([]);
  const [moviesLikeLoading, setMoviesLikeLoading] = useState(false);

  const [dismissedMovies, setDismissedMovies] = useState<UserMovie[]>([]);
  const [dismissedOpen, setDismissedOpen] = useState(false);
  const [dismissedLoading, setDismissedLoading] = useState(false);

  const [recDetail, setRecDetail] = useState<SearchResult | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');

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

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

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

  const handleFolderImport = async (files: FileList) => {
    setImporting(true);
    setImportStatus('Reading export folder...');
    const fileMap: Record<string, File> = {};
    for (let i = 0; i < files.length; i++) {
      const name = files[i].name.toLowerCase();
      if (name === 'watchlist.csv') fileMap.watchlist = files[i];
      if (name === 'ratings.csv') fileMap.ratings = files[i];
      if (name === 'watched.csv') fileMap.watched = files[i];
    }

    const types = ['watchlist', 'ratings', 'watched'] as const;
    const found = types.filter((t) => fileMap[t]);
    if (found.length === 0) {
      setImportStatus('No Letterboxd CSV files found. Make sure you selected the unzipped export folder.');
      setImporting(false);
      return;
    }

    const summaries: string[] = [];
    for (const type of found) {
      setImportStatus(`Importing ${type}... (${found.indexOf(type) + 1}/${found.length})`);
      try {
        const res = await importApi[type](fileMap[type]);
        const { imported, skipped, failed, total } = res.data.results;
        let s = `${type}: ${imported} imported`;
        if (skipped > 0) s += `, ${skipped} existed`;
        if (failed > 0) s += `, ${failed} failed`;
        s += ` (${total})`;
        summaries.push(s);
      } catch {
        summaries.push(`${type}: failed`);
      }
    }
    setImportStatus(summaries.join(' · '));
    loadWatchlist();
    setImporting(false);
  };

  const removeFromRecommendations = (tmdbId: number) => {
    setRecommendations((prev) => prev.filter((r) => r.tmdbId !== tmdbId));
    setMoviesLike((prev) => prev.filter((r) => r.tmdbId !== tmdbId));
  };

  const handleDismissRec = async (rec: SearchResult) => {
    removeFromRecommendations(rec.tmdbId);
    try {
      await recommendationApi.dismiss(rec.tmdbId);
      if (dismissedOpen) {
        const res = await recommendationApi.dismissed();
        setDismissedMovies(res.data.movies);
      }
    } catch (err) {
      console.warn('[recs] dismiss failed', err);
    }
  };

  const loadDismissed = async () => {
    setDismissedLoading(true);
    try {
      const res = await recommendationApi.dismissed();
      setDismissedMovies(res.data.movies);
    } catch {
      // ignore
    } finally {
      setDismissedLoading(false);
    }
  };

  const handleUndismiss = async (um: UserMovie) => {
    setDismissedMovies((prev) => prev.filter((m) => m.id !== um.id));
    try {
      await recommendationApi.undismiss(um.movie.tmdbId!);
    } catch {
      // best-effort
    }
  };

  const handleToggleDismissed = () => {
    const next = !dismissedOpen;
    setDismissedOpen(next);
    if (next && dismissedMovies.length === 0) loadDismissed();
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
      removeFromRecommendations(rec.tmdbId);
      setRecDetail(null);
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
      setSortDir(field === 'runtime' ? 'asc' : 'desc');
    }
  };

  const filteredWatchlist = useMemo(() => {
    let result = [...watchlist];

    if (watchlistFilter) {
      const q = watchlistFilter.toLowerCase();
      result = result.filter(um => um.movie.title.toLowerCase().includes(q));
    }

    if (filterGenres.length > 0) {
      result = result.filter(um =>
        filterGenres.some(g => (um.movie.genres as string[]).includes(g))
      );
    }

    if (filterDecade) {
      const decadeStart = parseInt(filterDecade);
      result = result.filter(um =>
        um.movie.year != null && um.movie.year >= decadeStart && um.movie.year < decadeStart + 10
      );
    }

    if (filterMinRating > 0) {
      result = result.filter(um => (um.movie.tmdbRating ?? 0) >= filterMinRating);
    }
    if (filterMaxRating < 10) {
      result = result.filter(um => (um.movie.tmdbRating ?? 0) <= filterMaxRating);
    }

    if (filterMaxRuntime > 0) {
      result = result.filter(um => (um.movie.runtime ?? 0) <= filterMaxRuntime);
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
                className="flex-shrink-0 w-28 snap-start group cursor-pointer relative"
                onClick={() => setRecDetail(rec)}
              >
                <div className="w-28 aspect-[2/3] rounded-xl overflow-hidden bg-card mb-2 shadow-lg group-hover:shadow-coral/20 group-hover:scale-[1.03] transition-all">
                  <MoviePoster posterUrl={rec.posterUrl} title={rec.title} />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDismissRec(rec); }}
                  className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-charcoal/85 backdrop-blur-sm text-cream-dim hover:text-coral hover:bg-charcoal flex items-center justify-center transition-colors text-sm leading-none shadow-md"
                  title="Not interested"
                  aria-label="Not interested"
                >
                  ✕
                </button>
                <p className="text-xs font-medium truncate">{rec.title}</p>
                <p className="text-cream-dim text-[10px]">
                  {rec.year}{rec.rating ? ` · ${rec.rating.toFixed(1)}★` : ''}
                </p>
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
        {/* Dismissed recs toggle */}
        <button
          onClick={handleToggleDismissed}
          className="mt-2 text-cream-dim text-[11px] hover:text-cream transition-colors"
        >
          {dismissedOpen ? 'Hide hidden movies' : 'Manage hidden movies'}
        </button>
        {dismissedOpen && (
          <div className="mt-2">
            {dismissedLoading ? (
              <div className="flex items-center justify-center py-3">
                <LoadingSpinner size="sm" />
              </div>
            ) : dismissedMovies.length === 0 ? (
              <p className="text-cream-dim text-xs">No hidden movies.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {dismissedMovies.map((um) => (
                  <div key={um.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-12 rounded overflow-hidden flex-shrink-0 bg-card">
                        <MoviePoster posterUrl={um.movie.posterUrl} title={um.movie.title} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{um.movie.title}</p>
                        <p className="text-cream-dim text-[10px]">{um.movie.year}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUndismiss(um)}
                      className="text-xs text-coral hover:text-coral/80 transition-colors flex-shrink-0"
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                  <div
                    key={rec.tmdbId}
                    className="flex-shrink-0 w-28 snap-start group cursor-pointer relative"
                    onClick={() => setRecDetail(rec)}
                  >
                    <div className="w-28 aspect-[2/3] rounded-xl overflow-hidden bg-card mb-2 shadow-lg group-hover:shadow-coral/20 group-hover:scale-[1.03] transition-all">
                      <MoviePoster posterUrl={rec.posterUrl} title={rec.title} />
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDismissRec(rec); }}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-charcoal/85 backdrop-blur-sm text-cream-dim hover:text-coral hover:bg-charcoal flex items-center justify-center transition-colors text-sm leading-none shadow-md"
                      title="Not interested"
                      aria-label="Not interested"
                    >
                      ✕
                    </button>
                    <p className="text-xs font-medium truncate">{rec.title}</p>
                    <p className="text-cream-dim text-[10px]">
                      {rec.year}{rec.rating ? ` · ${rec.rating.toFixed(1)}★` : ''}
                    </p>
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

        {/* Letterboxd import (first-time only — once stored, resync lives in the list header) */}
        {!hasLetterboxd && !letterboxdDismissed && (
        <div className="mt-3 pt-3 border-t border-cream-dim/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-cream-dim text-xs">Already on Letterboxd?</p>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('letterboxdImportDismissed', '1');
                setLetterboxdDismissed(true);
              }}
              title="You can still connect from your profile"
              className="text-cream-dim/50 hover:text-cream transition-colors text-xs"
            >
              Hide
            </button>
          </div>
          <LetterboxdImport mode="library" onSuccess={() => loadWatchlist()} />

          <button
            onClick={() => setImportOpen((v) => !v)}
            className="text-cream-dim/70 text-xs hover:text-cream transition-colors"
          >
            {importOpen ? 'Hide CSV import' : 'Import from a Letterboxd CSV export instead'}
          </button>

          <AnimatePresence>
            {importOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-2">
                  <ol className="text-cream-dim text-xs mb-3 space-y-1 list-decimal list-inside">
                    <li>
                      Open{' '}
                      <a
                        href="https://letterboxd.com/settings/data/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-coral hover:underline"
                      >
                        letterboxd.com/settings/data
                      </a>{' '}
                      and click &quot;Export your data&quot;.
                    </li>
                    <li>Unzip the downloaded file.</li>
                    <li>Choose the unzipped folder below.</li>
                  </ol>
                  <label
                    className={`flex items-center justify-center gap-2 p-4 glass rounded-xl border border-dashed border-cream-dim/30 transition-colors ${
                      importing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-coral/50 hover:bg-card-hover'
                    }`}
                  >
                    <svg className="w-5 h-5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="text-cream text-sm">
                      {importing ? 'Importing...' : 'Select Letterboxd export folder'}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) handleFolderImport(e.target.files);
                      }}
                      disabled={importing}
                    />
                  </label>
                  {importStatus && (
                    <p className="text-cream-dim text-xs text-center mt-2">{importStatus}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        )}
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

      {/* Watchlist with search/filter */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-lg font-semibold font-display">
            {libraryFilter === 'watchlist' ? 'Your Watchlist' : libraryFilter === 'watched' ? 'Watched' : 'All Movies'}
          </h2>
          <div className="flex items-center gap-3">
            {hasLetterboxd && (
              <LetterboxdResyncButton
                onSuccess={() => loadWatchlist()}
                onToast={addToast}
              />
            )}
            <span className="text-cream-dim text-sm whitespace-nowrap">
              {hasActiveFilters || watchlistFilter
                ? `${filteredWatchlist.length} of ${watchlist.length}`
                : watchlist.length} movies
            </span>
          </div>
        </div>

        {/* Library sub-filters */}
        <div className="flex gap-2 mb-3">
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

        {/* Watchlist search */}
        {watchlist.length > 5 && (
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Search..."
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
          libraryFilter === 'watched' ? (
            <div className="text-center py-8">
              <p className="text-cream-dim mb-2">Nothing marked watched yet</p>
              <p className="text-cream-dim text-sm">Movies you mark as watched will show up here.</p>
            </div>
          ) : (
            <div className="text-center py-8 space-y-3">
              <p className="text-cream-dim">Your watchlist is empty</p>
              <p className="text-cream-dim text-sm">Tap a few picks you&apos;d happily watch to get started.</p>
              <div className="flex flex-col gap-2 max-w-xs mx-auto pt-2">
                <button
                  onClick={() => setSeedGridOpen(true)}
                  className="w-full py-2.5 bg-coral text-charcoal rounded-xl font-semibold hover:bg-coral-dark transition-colors"
                >
                  Tap a few picks
                </button>
                <button
                  onClick={() => router.push('/discover')}
                  className="w-full py-2 text-cream-dim text-sm hover:text-cream transition-colors"
                >
                  Or discover something new
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {visibleWatchlist.map((um) => (
              <div
                key={um.id}
                className="relative group cursor-pointer"
                onClick={() => { setSelectedMovie(um.movie); setSelectedUserMovie(um); }}
              >
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-card transition-all duration-200 group-hover:ring-2 group-hover:ring-coral/50 group-hover:scale-[1.03] group-hover:shadow-lg group-hover:shadow-coral/10">
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

      {/* Rec Detail Sheet */}
      <RecDetailSheet
        rec={recDetail}
        onClose={() => setRecDetail(null)}
        onAdd={handleAddRecommendation}
        onDismiss={handleDismissRec}
      />

      {/* Seed grid modal */}
      <AnimatePresence>
        {seedGridOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-charcoal/85 backdrop-blur-sm z-40"
              onClick={() => setSeedGridOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ type: 'spring', damping: 22, stiffness: 260 }}
              className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none"
            >
              <div className="glass rounded-3xl p-6 w-full max-w-md pointer-events-auto max-h-[90vh] overflow-y-auto">
                <OnboardingSeedGrid
                  onDone={() => {
                    setSeedGridOpen(false);
                    loadWatchlist();
                    addToast('Added to your watchlist');
                  }}
                  onSkip={() => setSeedGridOpen(false)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Movie Detail Modal */}
      <MovieDetailModal
        movie={selectedMovie}
        open={!!selectedMovie}
        onClose={() => { setSelectedMovie(null); setSelectedUserMovie(null); }}
        userMovie={selectedUserMovie}
        onToggleWatched={handleToggleWatched}
        onRate={handleRateMovie}
        onRemove={(um) => {
          setRemoveMovieId(um.movieId);
          setSelectedMovie(null);
          setSelectedUserMovie(null);
        }}
        onMoviesLike={loadMoviesLike}
      />
    </motion.div>
  );
}
