'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { coupleApi, importApi, sessionApi, movieApi, swipeApi } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';

interface Couple {
  id: string;
  inviteCode: string;
  user1: { id: string; displayName: string };
  user2: { id: string; displayName: string } | null;
}

interface Movie {
  id: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  genres: string[];
  tmdbRating: number | null;
  runtime: number | null;
  overview: string | null;
  director: string | null;
  cast: string[];
  streamingProviders: { name: string; type: string; logoUrl: string }[];
}

interface UserMovie {
  id: string;
  movieId: string;
  movie: Movie;
  onWatchlist: boolean;
  watched: boolean;
  source: string;
}

interface SearchResult {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  rating: number | null;
}

interface HistorySession {
  id: string;
  status: string;
  createdAt: string;
  movieCount: number;
  matchCount: number;
  matches: {
    id: string;
    movie: Movie;
    watched: boolean;
    watchedAt: string | null;
  }[];
}

interface Filters {
  genres: string[];
  decade: string;
  minRating: number;
  maxRuntime: number;
  streamingProvider: string;
}

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music',
  'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western',
];

const DECADE_OPTIONS = ['1970', '1980', '1990', '2000', '2010', '2020'];

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [couple, setCouple] = useState<Couple | null>(null);
  const [coupleLoaded, setCoupleLoaded] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [tab, setTab] = useState<'library' | 'import' | 'swipe' | 'history'>('library');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    genres: [],
    decade: '',
    minRating: 0,
    maxRuntime: 0,
    streamingProvider: '',
  });
  const [copied, setCopied] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const [watchlist, setWatchlist] = useState<UserMovie[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [watchlistFilter, setWatchlistFilter] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingTmdbId, setAddingTmdbId] = useState<number | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  const [history, setHistory] = useState<HistorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?mode=login');
      return;
    }
    if (user) {
      loadWatchlist();
      coupleApi.me()
        .then((res) => {
          setCouple(res.data.couple);
          setCoupleLoaded(true);
        })
        .catch(() => {
          setCoupleLoaded(true);
        });
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!couple?.id || couple.user2) return;

    connectSocket();
    const socket = getSocket();
    socket.emit('join-couple', couple.id);

    socket.on('partner-joined', (data: { couple: Couple }) => {
      setCouple(data.couple);
    });

    return () => {
      socket.off('partner-joined');
    };
  }, [couple?.id, couple?.user2]);

  useEffect(() => {
    if (!couple?.id || !couple.user2) return;

    connectSocket();
    const socket = getSocket();
    socket.emit('join-couple', couple.id);

    socket.on('partner-left', () => {
      coupleApi.me()
        .then((res) => setCouple(res.data.couple))
        .catch(() => setCouple(null));
    });

    return () => {
      socket.off('partner-left');
    };
  }, [couple?.id, couple?.user2]);

  const loadWatchlist = async () => {
    setLibraryLoading(true);
    try {
      const res = await movieApi.mine('watchlist');
      setWatchlist(res.data.movies);
    } catch {
      // ignore
    } finally {
      setLibraryLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await sessionApi.history();
      setHistory(res.data.sessions);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCreateCouple = async () => {
    const res = await coupleApi.create();
    setCouple(res.data.couple);
  };

  const handleJoinCouple = async () => {
    if (!inviteInput.trim()) return;
    const res = await coupleApi.join(inviteInput.trim());
    setCouple(res.data.couple);
  };

  const handleLeaveCouple = async () => {
    try {
      await coupleApi.leave();
      setCouple(null);
      setShowLeaveConfirm(false);
    } catch {
      // ignore
    }
  };

  const handleCopyCode = () => {
    if (!couple) return;
    navigator.clipboard.writeText(couple.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileImport = async (type: 'watchlist' | 'ratings' | 'watched', file: File) => {
    setImporting(true);
    setImportStatus(`Importing ${type}...`);
    try {
      const res = await importApi[type](file);
      const { imported, skipped, failed, total } = res.data.results;
      let status = `${type}: ${imported} imported`;
      if (skipped > 0) status += `, ${skipped} already existed`;
      if (failed > 0) status += `, ${failed} failed`;
      status += ` (${total} total)`;
      setImportStatus(status);
      loadWatchlist();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setImportStatus(error.response?.data?.error || `Failed to import ${type}`);
    } finally {
      setImporting(false);
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
      setSearchResults((prev) => prev.filter((m) => m.tmdbId !== tmdbId));
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
    } catch {
      // ignore
    }
  };

  const handleMarkWatched = async (matchId: string) => {
    try {
      await swipeApi.markWatched(matchId);
      setHistory((prev) =>
        prev.map((s) => ({
          ...s,
          matches: s.matches.map((m) =>
            m.id === matchId ? { ...m, watched: true, watchedAt: new Date().toISOString() } : m
          ),
        }))
      );
    } catch {
      // ignore
    }
  };

  const handleStartSession = async () => {
    setSessionLoading(true);
    setSessionError('');
    try {
      const activeFilters: Record<string, unknown> = {};
      if (filters.genres.length > 0) activeFilters.genres = filters.genres;
      if (filters.decade) activeFilters.decade = filters.decade;
      if (filters.minRating > 0) activeFilters.minRating = filters.minRating;
      if (filters.maxRuntime > 0) activeFilters.maxRuntime = filters.maxRuntime;
      if (filters.streamingProvider) activeFilters.streamingProvider = filters.streamingProvider;

      const res = await sessionApi.create(
        Object.keys(activeFilters).length > 0 ? activeFilters : undefined
      );
      router.push(`/session/${res.data.session.id}`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setSessionError(error.response?.data?.error || 'Failed to start session');
    } finally {
      setSessionLoading(false);
    }
  };

  const handleResumeSession = async () => {
    try {
      const res = await sessionApi.active();
      router.push(`/session/${res.data.session.id}`);
    } catch {
      setSessionError('No active session found');
    }
  };

  const toggleGenre = (genre: string) => {
    setFilters((prev) => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter((g) => g !== genre)
        : [...prev.genres, genre],
    }));
  };

  const filteredWatchlist = watchlistFilter
    ? watchlist.filter((um) =>
        um.movie.title.toLowerCase().includes(watchlistFilter.toLowerCase())
      )
    : watchlist;

  const streamingProviders = Array.from(
    new Set(
      watchlist
        .flatMap((um) => ((um.movie.streamingProviders as { name: string; type: string }[]) || []).filter((p) => p.type === 'stream').map((p) => p.name))
    )
  ).sort();

  const isPaired = !!couple?.user2;
  const availableTabs = isPaired
    ? (['library', 'import', 'swipe', 'history'] as const)
    : (['library', 'import'] as const);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-amber border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-6 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'var(--font-playfair)' }}
        >
          Movie<span className="text-amber">Picker</span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-cream-dim text-sm">{user?.displayName}</span>
          <button onClick={logout} className="text-cream-dim text-sm hover:text-coral transition-colors">
            Sign out
          </button>
        </div>
      </div>

      {/* Couple pairing section */}
      {coupleLoaded && !couple?.user2 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-6 mb-6"
        >
          <h2 className="text-xl font-semibold mb-2" style={{ fontFamily: 'var(--font-playfair)' }}>
            Pair Up
          </h2>
          <p className="text-cream-dim text-sm mb-4">
            Pair with your partner to start swiping together. You can build your watchlist while you wait.
          </p>

          {couple ? (
            <div>
              <p className="text-cream-dim mb-3">Share this code with your partner:</p>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 py-3 px-4 bg-charcoal rounded-xl text-center text-2xl font-mono tracking-widest text-amber">
                  {couple.inviteCode}
                </div>
                <button
                  onClick={handleCopyCode}
                  className="py-3 px-4 glass rounded-xl text-cream-dim hover:text-cream transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-cream-dim text-sm">Waiting for your partner to join...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <button
                onClick={handleCreateCouple}
                className="w-full py-3 bg-amber text-charcoal font-semibold rounded-xl hover:bg-amber-dark transition-colors"
              >
                Create Invite Code
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-card" />
                <span className="text-cream-dim text-sm">or</span>
                <div className="flex-1 h-px bg-card" />
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Enter invite code"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                  className="flex-1 px-4 py-3 glass rounded-xl bg-transparent text-cream placeholder:text-cream-dim focus:outline-none focus:ring-2 focus:ring-amber font-mono tracking-widest text-center"
                  maxLength={8}
                />
                <button
                  onClick={handleJoinCouple}
                  className="py-3 px-6 bg-amber text-charcoal font-semibold rounded-xl hover:bg-amber-dark transition-colors"
                >
                  Join
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Couple connected banner */}
      {isPaired && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-4 mb-6 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-amber flex items-center justify-center text-charcoal font-bold">
            {couple!.user1.displayName[0]}
          </div>
          <span className="text-coral text-lg">&amp;</span>
          <div className="w-10 h-10 rounded-full bg-coral flex items-center justify-center text-charcoal font-bold">
            {couple!.user2!.displayName[0]}
          </div>
          <span className="text-cream-dim text-sm ml-auto">Paired</span>
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="text-cream-dim text-xs hover:text-coral transition-colors"
          >
            Leave
          </button>
        </motion.div>
      )}

      {/* Leave confirmation dialog */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal/80 z-50 flex items-center justify-center px-6"
            onClick={() => setShowLeaveConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass rounded-2xl p-6 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-2">Leave Couple?</h3>
              <p className="text-cream-dim text-sm mb-4">
                This will unpair you from your partner. Your watchlist will remain.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 py-2 glass rounded-xl text-cream-dim hover:text-cream transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeaveCouple}
                  className="flex-1 py-2 bg-danger/80 text-cream rounded-xl hover:bg-danger transition-colors"
                >
                  Leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      {coupleLoaded && (
        <div className="flex gap-2 mb-6">
          {availableTabs.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (t === 'history') loadHistory();
              }}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-amber text-charcoal' : 'glass text-cream-dim'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* Library tab */}
        {tab === 'library' && (
          <motion.div
            key="library"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
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
                    <div className="w-5 h-5 border-2 border-amber border-t-transparent rounded-full animate-spin" />
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
                        {movie.posterUrl ? (
                          <img src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-cream-dim text-xs">No img</div>
                        )}
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
                        disabled={addingTmdbId === movie.tmdbId}
                        className="px-3 py-1.5 bg-amber text-charcoal text-sm font-medium rounded-lg hover:bg-amber-dark transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {addingTmdbId === movie.tmdbId ? '...' : '+ Add'}
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
                <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-playfair)' }}>
                  Your Watchlist
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
                  <div className="w-8 h-8 border-2 border-amber border-t-transparent rounded-full animate-spin" />
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
                      onClick={() => setSelectedMovie(um.movie)}
                    >
                      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-card">
                        {um.movie.posterUrl ? (
                          <img
                            src={um.movie.posterUrl}
                            alt={um.movie.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center p-2 text-center">
                            <span className="text-cream-dim text-xs">{um.movie.title}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-charcoal/0 group-hover:bg-charcoal/60 transition-colors flex items-center justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromWatchlist(um.movieId);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 bg-danger/80 text-cream text-xs rounded-lg"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <p className="text-xs mt-1 truncate">{um.movie.title}</p>
                      <p className="text-xs text-cream-dim">{um.movie.year}</p>
                    </div>
                  ))}
                </div>
              )}

              {watchlistFilter && filteredWatchlist.length === 0 && watchlist.length > 0 && (
                <p className="text-cream-dim text-sm text-center mt-3">No matches for &quot;{watchlistFilter}&quot;</p>
              )}
            </div>
          </motion.div>
        )}

        {/* Import tab */}
        {tab === 'import' && (
          <motion.div
            key="import"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="glass rounded-2xl p-6"
          >
            <h2 className="text-xl font-semibold mb-2" style={{ fontFamily: 'var(--font-playfair)' }}>
              Import from Letterboxd
            </h2>
            <p className="text-cream-dim text-sm mb-6">
              Export your data from Letterboxd (Settings &rarr; Import &amp; Export) and upload the CSVs here.
              This is optional — you can also build your list manually from the Library tab.
            </p>

            {['watchlist', 'ratings', 'watched'].map((type) => (
              <label
                key={type}
                className={`flex items-center justify-between p-4 glass rounded-xl mb-3 transition-colors ${
                  importing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-card-hover'
                }`}
              >
                <span className="capitalize font-medium">{type}</span>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileImport(type as 'watchlist' | 'ratings' | 'watched', file);
                  }}
                  disabled={importing}
                />
                <span className="text-amber text-sm">{importing ? 'Importing...' : 'Upload CSV'}</span>
              </label>
            ))}

            {importStatus && (
              <div className="mt-4 p-3 glass rounded-xl">
                <p className="text-cream-dim text-sm text-center">{importStatus}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Swipe tab — only when paired */}
        {tab === 'swipe' && isPaired && (
          <motion.div
            key="swipe"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            {/* Pool preview */}
            <div className="glass rounded-2xl p-4">
              <p className="text-cream-dim text-sm">
                Your combined watchlists have <span className="text-amber font-semibold">{watchlist.length}</span> movies.
                {watchlist.length === 0 && ' Add some movies first from the Library tab.'}
              </p>
            </div>

            {/* Filters */}
            <div className="glass rounded-2xl p-6">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="w-full flex items-center justify-between"
              >
                <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-playfair)' }}>
                  Filters
                </h2>
                <span className="text-cream-dim text-sm">
                  {showFilters ? 'Hide' : 'Show'}
                </span>
              </button>

              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 space-y-4">
                      {/* Genres */}
                      <div>
                        <label className="text-cream-dim text-sm mb-2 block">Genres</label>
                        <div className="flex flex-wrap gap-2">
                          {GENRE_OPTIONS.map((genre) => (
                            <button
                              key={genre}
                              onClick={() => toggleGenre(genre)}
                              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                                filters.genres.includes(genre)
                                  ? 'bg-amber text-charcoal'
                                  : 'glass text-cream-dim'
                              }`}
                            >
                              {genre}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Decade */}
                      <div>
                        <label className="text-cream-dim text-sm mb-2 block">Decade</label>
                        <div className="flex flex-wrap gap-2">
                          {DECADE_OPTIONS.map((decade) => (
                            <button
                              key={decade}
                              onClick={() => setFilters((p) => ({ ...p, decade: p.decade === decade ? '' : decade }))}
                              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                                filters.decade === decade
                                  ? 'bg-amber text-charcoal'
                                  : 'glass text-cream-dim'
                              }`}
                            >
                              {decade}s
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Streaming provider */}
                      {streamingProviders.length > 0 && (
                        <div>
                          <label className="text-cream-dim text-sm mb-2 block">Streaming Service</label>
                          <div className="flex flex-wrap gap-2">
                            {streamingProviders.map((provider) => (
                              <button
                                key={provider}
                                onClick={() =>
                                  setFilters((p) => ({
                                    ...p,
                                    streamingProvider: p.streamingProvider === provider ? '' : provider,
                                  }))
                                }
                                className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                                  filters.streamingProvider === provider
                                    ? 'bg-amber text-charcoal'
                                    : 'glass text-cream-dim'
                                }`}
                              >
                                {provider}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Min rating */}
                      <div>
                        <label className="text-cream-dim text-sm mb-2 block">
                          Min TMDb Rating: {filters.minRating > 0 ? filters.minRating : 'Any'}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="9"
                          step="0.5"
                          value={filters.minRating}
                          onChange={(e) => setFilters((p) => ({ ...p, minRating: parseFloat(e.target.value) }))}
                          className="w-full accent-amber"
                        />
                      </div>

                      {/* Max runtime */}
                      <div>
                        <label className="text-cream-dim text-sm mb-2 block">
                          Max Runtime: {filters.maxRuntime > 0 ? `${filters.maxRuntime} min` : 'Any'}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="240"
                          step="15"
                          value={filters.maxRuntime}
                          onChange={(e) => setFilters((p) => ({ ...p, maxRuntime: parseInt(e.target.value) }))}
                          className="w-full accent-amber"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Error message */}
            {sessionError && (
              <div className="p-3 glass rounded-xl border border-danger/30">
                <p className="text-coral text-sm text-center">{sessionError}</p>
              </div>
            )}

            {/* How it works */}
            <div className="glass rounded-2xl p-4">
              <h3 className="font-medium text-sm mb-2">How it works</h3>
              <ol className="text-cream-dim text-xs space-y-1 list-decimal list-inside">
                <li>Both you and your partner swipe through the movie pool</li>
                <li>Swipe right to like, left to skip (or tap the buttons)</li>
                <li>Movies you both swipe right on become matches</li>
                <li>Spin the roulette wheel to pick your movie night winner</li>
              </ol>
            </div>

            {/* Start / Resume */}
            <div className="flex flex-col gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStartSession}
                disabled={sessionLoading}
                className="w-full py-4 bg-amber text-charcoal font-semibold rounded-xl text-lg hover:bg-amber-dark transition-colors disabled:opacity-50"
              >
                {sessionLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
                    Creating session...
                  </span>
                ) : (
                  'Start Swiping'
                )}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleResumeSession}
                className="w-full py-3 glass text-cream font-medium rounded-xl hover:bg-card-hover transition-colors"
              >
                Resume Session
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* History tab */}
        {tab === 'history' && isPaired && (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-playfair)' }}>
              Session History
            </h2>

            {historyLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-2 border-amber border-t-transparent rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="glass rounded-2xl p-6 text-center">
                <p className="text-cream-dim">No sessions yet. Start swiping to build your history!</p>
              </div>
            ) : (
              history.map((session) => (
                <div key={session.id} className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(session.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="text-cream-dim text-xs">
                        {session.movieCount} movies swiped · {session.matchCount} matches
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        session.status === 'completed'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-amber/20 text-amber'
                      }`}
                    >
                      {session.status}
                    </span>
                  </div>

                  {session.matches.length > 0 && (
                    <div className="space-y-2">
                      {session.matches.map((match) => (
                        <div
                          key={match.id}
                          className="flex items-center gap-3 p-2 glass rounded-xl"
                        >
                          <div className="w-10 h-15 rounded-lg overflow-hidden bg-card flex-shrink-0">
                            {match.movie.posterUrl ? (
                              <img src={match.movie.posterUrl} alt={match.movie.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-cream-dim text-[8px]">
                                {match.movie.title}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{match.movie.title}</p>
                            <p className="text-cream-dim text-xs">{match.movie.year}</p>
                          </div>
                          {match.watched ? (
                            <span className="text-green-400 text-xs flex-shrink-0">Watched</span>
                          ) : (
                            <button
                              onClick={() => handleMarkWatched(match.id)}
                              className="text-amber text-xs flex-shrink-0 hover:underline"
                            >
                              Mark watched
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {session.status !== 'completed' && (
                    <button
                      onClick={() => router.push(`/session/${session.id}`)}
                      className="w-full mt-3 py-2 glass rounded-xl text-amber text-sm hover:bg-card-hover transition-colors"
                    >
                      Continue swiping
                    </button>
                  )}
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Movie Detail Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal/80 z-50 flex items-end sm:items-center justify-center"
            onClick={() => setSelectedMovie(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="glass rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-4 mb-4">
                {selectedMovie.posterUrl ? (
                  <img
                    src={selectedMovie.posterUrl}
                    alt={selectedMovie.title}
                    className="w-24 h-36 rounded-xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-24 h-36 rounded-xl bg-card flex items-center justify-center flex-shrink-0">
                    <span className="text-cream-dim text-xs text-center p-2">{selectedMovie.title}</span>
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-playfair)' }}>
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
                  <div className="flex flex-wrap gap-2">
                    {selectedMovie.streamingProviders.map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5 glass rounded-lg px-2 py-1">
                        <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded" />
                        <span className="text-xs">{p.name}</span>
                        <span className="text-cream-dim text-[10px]">({p.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setSelectedMovie(null)}
                className="w-full py-3 glass rounded-xl text-cream-dim hover:text-cream transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
