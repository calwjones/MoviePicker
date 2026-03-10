'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { sessionApi, soloApi, movieApi, providerApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import LoadingSpinner from '@/components/LoadingSpinner';
import { connectSocket, getSocket } from '@/lib/socket';
import { getBaseName } from '@/components/StreamingProviders';
import MoodPicker, { MOOD_PRESETS, type MoodPreset } from '@/components/MoodPicker';
import { DECADE_OPTIONS } from '@/lib/decades';
import type { Filters } from '@shared/types';

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music',
  'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western',
];

interface ProviderChip {
  name: string;
  logoUrl: string;
  displayPriority: number;
}

const PREFERRED_PROVIDERS = [
  'Netflix',
  'Disney Plus',
  'Amazon Prime Video',
  'Prime Video',
  'Max',
  'HBO Max',
  'Apple TV Plus',
  'MUBI',
  'Paramount Plus',
  'NOW',
  'BBC iPlayer',
  'ITVX',
  'Channel 4',
  'Crunchyroll',
  'Hulu',
  'Peacock',
  'Shudder',
  'BritBox',
];

const RENTAL_PROVIDERS = new Set([
  'Google Play Movies',
  'YouTube',
  'Apple TV',
  'iTunes',
  'Amazon Video',
  'Microsoft Store',
  'Xbox',
  'Rakuten TV',
  'Chili',
  'Sky Store',
  'Fandango At Home',
  'Vudu',
  'Redbox',
]);

interface Participant {
  displayName: string;
  type: 'registered' | 'guest';
}

interface SwipeTabProps {
  addToast: (message: string) => void;
}

export default function SwipeTab({ addToast }: SwipeTabProps) {
  const router = useRouter();

  const [poolSize, setPoolSize] = useState<number>(0);
  const [poolSizeLoading, setPoolSizeLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeMood, setActiveMood] = useState<string | null>(null);
  const [streamingProviders, setStreamingProviders] = useState<ProviderChip[]>([]);
  const [providersExpanded, setProvidersExpanded] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [soloLoading, setSoloLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [moodPickerOpen, setMoodPickerOpen] = useState(false);

  const [groupSessionId, setGroupSessionId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const [filters, setFilters] = useState<Filters>({
    genres: [], decade: '', minRating: 0, maxRuntime: 0, streamingProviders: [],
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('moviepicker_filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.streamingProviders)) {
          parsed.streamingProviders = Array.from(
            new Set(parsed.streamingProviders.map((s: string) => getBaseName(s)))
          );
        }
        setFilters((prev) => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('moviepicker_filters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    const run = async () => {
      setPoolSizeLoading(true);
      try {
        const [poolRes, provRes] = await Promise.all([
          movieApi.getPoolSize(),
          providerApi.list(),
        ]);
        setPoolSize(poolRes.data.size);
        const raw = provRes.data.providers as { name: string; logoUrl: string; displayPriority?: number }[];
        const seen = new Map<string, ProviderChip>();
        for (const p of raw) {
          const base = getBaseName(p.name);
          const priority = p.displayPriority ?? 9999;
          const existing = seen.get(base);
          if (!existing || priority < existing.displayPriority) {
            seen.set(base, { name: base, logoUrl: p.logoUrl, displayPriority: priority });
          }
        }
        const preferredRank = (name: string) => {
          const idx = PREFERRED_PROVIDERS.indexOf(name);
          return idx === -1 ? Infinity : idx;
        };
        const tier = (p: ProviderChip) => {
          if (PREFERRED_PROVIDERS.includes(p.name)) return 0;
          if (RENTAL_PROVIDERS.has(p.name)) return 2;
          return 1;
        };
        setStreamingProviders(
          Array.from(seen.values()).sort((a, b) => {
            const ta = tier(a);
            const tb = tier(b);
            if (ta !== tb) return ta - tb;
            if (ta === 0) return preferredRank(a.name) - preferredRank(b.name);
            return a.displayPriority - b.displayPriority;
          }),
        );
      } catch { /* ignore */ }
      finally { setPoolSizeLoading(false); }
    };
    run();
  }, []);

  useEffect(() => {
    if (!groupSessionId) return;
    connectSocket();
    const socket = getSocket();
    socket.emit('join-session', groupSessionId);

    socket.on('participant-joined', (data: Participant) => {
      setParticipants((prev) => [...prev, data]);
      addToast(`${data.displayName} joined!`);
    });

    return () => { socket.off('participant-joined'); };
  }, [groupSessionId, addToast]);

  const buildActiveFilters = useCallback((): Record<string, unknown> | undefined => {
    const active: Record<string, unknown> = {};
    if (filters.genres?.length > 0) active.genres = filters.genres;
    if (filters.decade) active.decade = filters.decade;
    if (filters.minRating > 0) active.minRating = filters.minRating;
    if (filters.maxRuntime > 0) active.maxRuntime = filters.maxRuntime;
    if (filters.streamingProviders?.length > 0) active.streamingProviders = filters.streamingProviders;
    return Object.keys(active).length > 0 ? active : undefined;
  }, [filters]);

  const handleCreateGroup = async () => {
    setSessionLoading(true);
    setSessionError('');
    try {
      const res = await sessionApi.createGroup(buildActiveFilters());
      setGroupSessionId(res.data.session.id);
      setShareLink(res.data.shareLink);
      setParticipants([]);
    } catch (err: unknown) {
      setSessionError(getErrorMessage(err, 'Failed to create session'));
    } finally {
      setSessionLoading(false);
    }
  };

  const handleStartGroup = async () => {
    if (!groupSessionId) return;
    setStartLoading(true);
    setSessionError('');
    try {
      await sessionApi.startGroup(groupSessionId);
      router.push(`/session/${groupSessionId}`);
    } catch (err: unknown) {
      setSessionError(getErrorMessage(err, 'Failed to start session'));
    } finally {
      setStartLoading(false);
    }
  };

  const handleCancelGroup = async () => {
    if (!groupSessionId) return;
    try {
      await sessionApi.cancel(groupSessionId);
    } catch { /* ignore */ }
    setGroupSessionId(null);
    setShareLink(null);
    setParticipants([]);
    addToast('Session cancelled');
  };

  const startSoloSession = async (overrideFilters?: Record<string, unknown>) => {
    setSoloLoading(true);
    setSessionError('');
    try {
      const res = await soloApi.create(overrideFilters ?? buildActiveFilters());
      router.push(`/solo/${res.data.session.id}`);
    } catch (err: unknown) {
      setSessionError(getErrorMessage(err, 'Failed to start solo session'));
    } finally {
      setSoloLoading(false);
    }
  };

  const handleStartSolo = () => {
    setMoodPickerOpen(true);
  };

  const handleMoodPick = (preset: MoodPreset) => {
    setMoodPickerOpen(false);
    setActiveMood(preset.label);
    const nextFilters: Filters = {
      ...filters,
      genres: [...preset.genres],
      minRating: preset.minRating,
      maxRuntime: preset.maxRuntime,
      decade: preset.decade,
    };
    setFilters(nextFilters);
    const active: Record<string, unknown> = {};
    if (nextFilters.genres.length > 0) active.genres = nextFilters.genres;
    if (nextFilters.decade) active.decade = nextFilters.decade;
    if (nextFilters.minRating > 0) active.minRating = nextFilters.minRating;
    if (nextFilters.maxRuntime > 0) active.maxRuntime = nextFilters.maxRuntime;
    if (nextFilters.streamingProviders && nextFilters.streamingProviders.length > 0) {
      active.streamingProviders = nextFilters.streamingProviders;
    }
    startSoloSession(Object.keys(active).length > 0 ? active : undefined);
  };

  const handleMoodSkip = () => {
    setMoodPickerOpen(false);
    startSoloSession();
  };

  const toggleGenre = (genre: string) => {
    setFilters((prev) => ({
      ...prev,
      genres: (prev.genres || []).includes(genre)
        ? (prev.genres || []).filter((g) => g !== genre)
        : [...(prev.genres || []), genre],
    }));
  };

  const applyMood = (label: string) => {
    if (activeMood === label) {
      setActiveMood(null);
      clearFilters();
      return;
    }
    const preset = MOOD_PRESETS.find((m) => m.label === label)!;
    setActiveMood(label);
    setFilters((prev) => ({
      ...prev,
      genres: [...preset.genres],
      minRating: preset.minRating,
      maxRuntime: preset.maxRuntime,
      decade: preset.decade,
    }));
    setShowFilters(true);
  };

  const clearFilters = () => {
    setActiveMood(null);
    setFilters({ genres: [], decade: '', minRating: 0, maxRuntime: 0, streamingProviders: [] });
  };

  const anyLoading = sessionLoading || soloLoading || startLoading;

  return (
    <motion.div
      key="swipe"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-4"
    >
      {/* Pool size */}
      <div className="glass rounded-2xl p-4">
        <p className="text-cream-dim text-sm">
          Your movie pool has{' '}
          <span className="text-danger font-semibold">{poolSizeLoading ? '...' : poolSize}</span> movies.
          {poolSize === 0 && !poolSizeLoading && ' Add some movies first from the Library tab.'}
        </p>
      </div>

      {/* Filters */}
      <div className="glass rounded-2xl p-6">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between"
        >
          <h2 className="text-xl font-semibold font-display">Filters</h2>
          <div className="flex items-center gap-3">
            {showFilters && (
              <button
                onClick={(e) => { e.stopPropagation(); clearFilters(); }}
                className="text-danger text-xs hover:underline"
              >
                Clear all
              </button>
            )}
            <span className="text-cream-dim text-sm">{showFilters ? 'Hide' : 'Show'}</span>
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
                <div>
                  <label className="text-cream-dim text-sm mb-2 block">Mood</label>
                  <div className="flex flex-wrap gap-2">
                    {MOOD_PRESETS.map(({ label }) => (
                      <button
                        key={label}
                        onClick={() => applyMood(label)}
                        className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 ${
                          activeMood === label
                            ? 'bg-coral text-charcoal'
                            : 'glass text-cream-dim'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-cream-dim text-sm mb-2 block">Genres</label>
                  <div className="flex flex-wrap gap-2">
                    {GENRE_OPTIONS.map((genre) => (
                      <button
                        key={genre}
                        onClick={() => toggleGenre(genre)}
                        className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 ${
                          (filters.genres || []).includes(genre)
                            ? 'bg-coral text-charcoal'
                            : 'glass text-cream-dim'
                        }`}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-cream-dim text-sm mb-2 block">Decade</label>
                  <div className="flex flex-wrap gap-2">
                    {DECADE_OPTIONS.map((decade) => (
                      <button
                        key={decade}
                        onClick={() => setFilters((p) => ({ ...p, decade: p.decade === decade ? '' : decade }))}
                        className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 ${
                          filters.decade === decade ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
                        }`}
                      >
                        {decade}s
                      </button>
                    ))}
                  </div>
                </div>

                {streamingProviders.length > 0 && (() => {
                  const selectedSet = new Set(filters.streamingProviders || []);
                  const defaultSlice = streamingProviders.filter((p) => PREFERRED_PROVIDERS.includes(p.name));
                  const extraSelected = streamingProviders.filter(
                    (p) => !PREFERRED_PROVIDERS.includes(p.name) && selectedSet.has(p.name),
                  );
                  const visible = providersExpanded
                    ? streamingProviders
                    : [...defaultSlice, ...extraSelected];
                  const hiddenCount = streamingProviders.length - visible.length;
                  return (
                    <div>
                      <label className="text-cream-dim text-sm mb-2 block">Streaming Service</label>
                      <div className="flex flex-wrap gap-2">
                        {visible.map((provider) => {
                          const selected = selectedSet.has(provider.name);
                          return (
                            <button
                              key={provider.name}
                              onClick={() =>
                                setFilters((p) => ({
                                  ...p,
                                  streamingProviders: selected
                                    ? (p.streamingProviders || []).filter((s) => s !== provider.name)
                                    : [...(p.streamingProviders || []), provider.name],
                                }))
                              }
                              className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-xs transition-all hover:-translate-y-0.5 ${
                                selected ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
                              }`}
                            >
                              <img src={provider.logoUrl} alt="" className="w-5 h-5 rounded" />
                              <span>{provider.name}</span>
                            </button>
                          );
                        })}
                        {hiddenCount > 0 && !providersExpanded && (
                          <button
                            onClick={() => setProvidersExpanded(true)}
                            className="px-3 py-1 rounded-full text-xs glass text-cream-dim hover:text-cream transition-colors"
                          >
                            +{hiddenCount} more
                          </button>
                        )}
                        {providersExpanded && (
                          <button
                            onClick={() => setProvidersExpanded(false)}
                            className="px-3 py-1 rounded-full text-xs glass text-cream-dim hover:text-cream transition-colors"
                          >
                            Show less
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <label className="text-cream-dim text-sm mb-2 block">
                    Min TMDb Rating: {filters.minRating > 0 ? filters.minRating : 'Any'}
                  </label>
                  <input
                    type="range" min="0" max="9" step="0.5"
                    value={filters.minRating}
                    onChange={(e) => setFilters((p) => ({ ...p, minRating: parseFloat(e.target.value) }))}
                    className="w-full accent-coral"
                  />
                </div>

                <div>
                  <label className="text-cream-dim text-sm mb-2 block">
                    Max Runtime: {filters.maxRuntime > 0 ? `${filters.maxRuntime} min` : 'Any'}
                  </label>
                  <input
                    type="range" min="0" max="240" step="15"
                    value={filters.maxRuntime}
                    onChange={(e) => setFilters((p) => ({ ...p, maxRuntime: parseInt(e.target.value) }))}
                    className="w-full accent-coral"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error */}
      {sessionError && (
        <div className="p-3 glass rounded-xl border border-danger/30">
          <p className="text-danger text-sm text-center">{sessionError}</p>
        </div>
      )}

      {/* Lobby — shown once a group session is created */}
      <AnimatePresence>
        {groupSessionId && shareLink && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Waiting for friends</h3>
              <button
                onClick={handleCancelGroup}
                className="text-cream-dim text-xs hover:text-danger transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Share link */}
            <div>
              <p className="text-cream-dim text-xs mb-2">
                Share this link — they join with or without an account:
              </p>
              <div className="flex gap-2 items-center">
                <p className="flex-1 text-xs text-cream font-mono truncate bg-charcoal rounded-lg px-3 py-2">
                  {shareLink}
                </p>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { navigator.clipboard.writeText(shareLink); addToast('Link copied!'); }}
                  className="px-3 py-2 bg-coral text-charcoal text-xs font-semibold rounded-lg shrink-0"
                >
                  Copy
                </motion.button>
              </div>
            </div>

            {/* Participant list */}
            <div>
              <p className="text-cream-dim text-xs mb-2">
                {participants.length === 0
                  ? 'No one has joined yet...'
                  : `${participants.length} joined:`}
              </p>
              <div className="flex flex-wrap gap-2">
                {participants.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-charcoal rounded-full"
                  >
                    <div className="w-2 h-2 rounded-full bg-coral" />
                    <span className="text-cream text-xs">{p.displayName}</span>
                    {p.type === 'registered' && (
                      <span className="text-cream-dim text-xs">(watchlist merged)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Start button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartGroup}
              disabled={startLoading}
              className="w-full py-3 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors disabled:opacity-50"
            >
              {startLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" /> Building movie pool...
                </span>
              ) : participants.length === 0
                ? 'Start Solo (just me)'
                : `Start Swiping (${participants.length + 1} people)`}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary action buttons — hidden while lobby is open */}
      {!groupSessionId && (
        <div className="space-y-2">
          {poolSize === 0 && !poolSizeLoading && (
            <p className="text-center text-xs text-cream-dim">
              Add movies to your library first — they form the swipe deck.
            </p>
          )}
          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartSolo}
              disabled={anyLoading || poolSize === 0 || poolSizeLoading}
              className="flex-1 py-4 bg-coral text-charcoal font-semibold rounded-xl text-lg hover:bg-coral-dark transition-all shadow-md hover:shadow-coral/40 disabled:opacity-50"
            >
              {soloLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" /> Starting...
                </span>
              ) : 'Solo Mode'}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCreateGroup}
              disabled={anyLoading || poolSize === 0 || poolSizeLoading}
              className="flex-1 py-4 glass text-danger font-semibold rounded-xl text-lg outline outline-1 outline-coral hover:bg-card-hover transition-all btn-glow disabled:opacity-50"
            >
              {sessionLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" /> Creating...
                </span>
              ) : 'Watch Together'}
            </motion.button>
          </div>
        </div>
      )}

      <MoodPicker
        open={moodPickerOpen}
        onClose={() => setMoodPickerOpen(false)}
        onPick={handleMoodPick}
        onSkip={handleMoodSkip}
      />
    </motion.div>
  );
}
