'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { sessionApi, movieApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { Filters } from '@shared/types';

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music',
  'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western',
];

const DECADE_OPTIONS = ['1970', '1980', '1990', '2000', '2010', '2020'];

interface SwipeTabProps {
  addToast: (message: string) => void;
}

export default function SwipeTab({ addToast }: SwipeTabProps) {
  const router = useRouter();

  const [poolSize, setPoolSize] = useState<number>(0);
  const [poolSizeLoading, setPoolSizeLoading] = useState(false);
  const [activeSession, setActiveSession] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [streamingProviders, setStreamingProviders] = useState<string[]>([]);

  const [filters, setFilters] = useState<Filters>({
    genres: [],
    decade: '',
    minRating: 0,
    maxRuntime: 0,
    streamingProvider: '',
  });

  // Load filters from local storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('moviepicker_filters');
      if (saved) {
        setFilters(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  // Save filters to local storage when they change
  useEffect(() => {
    localStorage.setItem('moviepicker_filters', JSON.stringify(filters));
  }, [filters]);

  const loadPoolSize = async () => {
    setPoolSizeLoading(true);
    try {
      const res = await movieApi.getPoolSize();
      setPoolSize(res.data.size);
    } catch {
      // ignore
    } finally {
      setPoolSizeLoading(false);
    }
  };

  const loadActiveSession = async () => {
    try {
      const res = await sessionApi.active();
      setActiveSession(true);
      setActiveSessionId(res.data.session.id);
    } catch {
      setActiveSession(false);
      setActiveSessionId(null);
    }
  };

  const loadStreamingProviders = async () => {
    try {
      const res = await movieApi.mine();
      const movies = res.data.movies as { movie: { streamingProviders?: { name: string; type: string }[] } }[];
      const providers = Array.from(
        new Set(
          movies.flatMap((um) =>
            ((um.movie.streamingProviders || []) as { name: string; type: string }[])
              .filter((p) => p.type === 'stream')
              .map((p) => p.name)
          )
        )
      ).sort();
      setStreamingProviders(providers);
    } catch {
      // ignore
    }
  };

  // Load pool size, active session, and streaming providers on mount
  useEffect(() => {
    loadPoolSize();
    loadActiveSession();
    loadStreamingProviders();
  }, []);

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
      setSessionError(getErrorMessage(err, 'Failed to start session'));
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
      setActiveSession(false);
    }
  };

  const handleCancelActiveSession = async () => {
    if (!activeSessionId) return;
    try {
      await sessionApi.cancel(activeSessionId);
      setActiveSession(false);
      setActiveSessionId(null);
      addToast('Session cancelled');
    } catch {
      addToast('Failed to cancel session');
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

  const clearFilters = () => {
    setFilters({
      genres: [],
      decade: '',
      minRating: 0,
      maxRuntime: 0,
      streamingProvider: '',
    });
  };

  return (
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
          Your combined watchlists have <span className="text-amber font-semibold">{poolSizeLoading ? '...' : poolSize}</span> movies.
          {poolSize === 0 && !poolSizeLoading && ' Add some movies first from the Library tab.'}
        </p>
      </div>

      {/* Filters */}
      <div className="glass rounded-2xl p-6">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between"
        >
          <h2 className="text-xl font-semibold font-display">
            Filters
          </h2>
          <div className="flex items-center gap-3">
            {showFilters && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearFilters();
                }}
                className="text-amber text-xs hover:underline"
              >
                Clear all
              </button>
            )}
            <span className="text-cream-dim text-sm">
              {showFilters ? 'Hide' : 'Show'}
            </span>
          </div>
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
          whileHover={poolSize > 0 ? { scale: 1.02 } : {}}
          whileTap={poolSize > 0 ? { scale: 0.98 } : {}}
          onClick={handleStartSession}
          disabled={sessionLoading || poolSize === 0 || poolSizeLoading}
          className="w-full py-4 bg-amber text-charcoal font-semibold rounded-xl text-lg hover:bg-amber-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sessionLoading ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" />
              Creating session...
            </span>
          ) : (
            `Start Swiping (${poolSize} movies)`
          )}
        </motion.button>
        {activeSession && (
          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleResumeSession}
              className="flex-1 py-3 glass text-cream font-medium rounded-xl hover:bg-card-hover transition-colors"
            >
              Resume Session
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCancelActiveSession}
              className="py-3 px-4 glass text-coral text-sm font-medium rounded-xl hover:bg-card-hover transition-colors"
            >
              Cancel
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
