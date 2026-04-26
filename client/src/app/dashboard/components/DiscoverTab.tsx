'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { browseApi, movieApi, providerApi } from '@/lib/api';
import MoviePoster from '@/components/MoviePoster';
import InCinemaBadge from '@/components/InCinemaBadge';
import RecDetailSheet from '@/components/RecDetailSheet';
import FilterSummary from '@/components/FilterSummary';
import FilterEditor, { PREFERRED_PROVIDERS, type ProviderChip } from '@/components/FilterEditor';
import { getBaseName } from '@/components/StreamingProviders';
import { useAuth } from '@/context/AuthContext';
import type { SearchResult, Filters } from '@matchsticked/shared';

interface BrowseRow {
  id: string;
  title: string;
  movies: SearchResult[];
}

interface DiscoverTabProps {
  addToast: (message: string) => void;
}

type ProviderIdMap = Record<string, number>;

const RENTAL_PROVIDERS = new Set([
  'Google Play Movies', 'YouTube', 'Apple TV', 'iTunes', 'Amazon Video',
  'Microsoft Store', 'Xbox', 'Rakuten TV', 'Chili', 'Sky Store',
  'Fandango At Home', 'Vudu', 'Redbox',
]);

const DEFAULT_FILTERS: Filters = {
  genres: [],
  decade: '',
  minRating: 0,
  maxRuntime: 0,
  streamingProviders: [],
};

interface SectionChip {
  key: string;
  label: string;
}

const EDITORIAL_CHIPS: SectionChip[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'top_rated', label: 'All-time greats' },
  { key: 'now_playing', label: 'New releases' },
  { key: 'hidden_gems', label: 'Hidden gems' },
  { key: 'critically_acclaimed', label: 'Critically acclaimed' },
  { key: 'decade_80s', label: '80s' },
  { key: 'decade_90s', label: '90s' },
  { key: 'decade_00s', label: '2000s' },
  { key: 'decade_10s', label: '2010s' },
];

const GENRE_CHIPS: SectionChip[] = [
  { key: 'genre_28', label: 'Action' },
  { key: 'genre_35', label: 'Comedy' },
  { key: 'genre_18', label: 'Drama' },
  { key: 'genre_99', label: 'Documentary' },
  { key: 'genre_27', label: 'Horror' },
  { key: 'genre_10749', label: 'Romance' },
  { key: 'genre_878', label: 'Sci-Fi' },
  { key: 'genre_53', label: 'Thriller' },
];

const SECTION_STORAGE_KEY = 'moviepicker_browse_sections';

export default function DiscoverTab({ addToast }: DiscoverTabProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<BrowseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recDetail, setRecDetail] = useState<SearchResult | null>(null);
  const [activeSections, setActiveSections] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [batchSize, setBatchSize] = useState<number | null>(50);
  const [providerIdByBase, setProviderIdByBase] = useState<ProviderIdMap>({});
  const [streamingProviders, setStreamingProviders] = useState<ProviderChip[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [providersExpanded, setProvidersExpanded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('moviepicker_filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.streamingProviders)) {
          parsed.streamingProviders = Array.from(
            new Set(parsed.streamingProviders.map((s: string) => getBaseName(s))),
          );
        }
        setFilters((prev) => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }

    try {
      const savedBatch = localStorage.getItem('moviepicker_batch_size');
      if (savedBatch !== null) {
        if (savedBatch === 'all') setBatchSize(null);
        else {
          const parsed = parseInt(savedBatch, 10);
          if (!Number.isNaN(parsed) && parsed > 0) setBatchSize(parsed);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    providerApi.list()
      .then((res) => {
        const raw = res.data.providers as { id: number; name: string; logoUrl: string; displayPriority?: number }[];
        const seen = new Map<string, ProviderChip>();
        const baseToId: ProviderIdMap = {};
        for (const p of raw) {
          const base = getBaseName(p.name);
          const priority = p.displayPriority ?? 9999;
          const existing = seen.get(base);
          if (!existing || priority < existing.displayPriority) {
            seen.set(base, { name: base, logoUrl: p.logoUrl, displayPriority: priority });
            baseToId[base] = p.id;
          } else if (baseToId[base] == null) {
            baseToId[base] = p.id;
          }
        }
        setProviderIdByBase(baseToId);
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
      })
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    localStorage.setItem('moviepicker_filters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    localStorage.setItem(
      'moviepicker_batch_size',
      batchSize === null ? 'all' : String(batchSize),
    );
  }, [batchSize]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const confirmedProviderNames = useMemo(() => {
    const confirmedIds = new Set(user?.preferredStreamingProviderIds ?? []);
    return new Set(
      streamingProviders
        .filter((p) => confirmedIds.has(providerIdByBase[p.name]))
        .map((p) => p.name),
    );
  }, [streamingProviders, providerIdByBase, user]);

  const handleStartDiscover = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.genres && filters.genres.length > 0) params.set('genres', filters.genres.join(','));
    if (filters.decade) params.set('decade', filters.decade);
    if (filters.minRating > 0) params.set('minRating', String(filters.minRating));
    if (batchSize != null) params.set('batchSize', String(batchSize));
    const names = filters.streamingProviders ?? [];
    if (names.length > 0) {
      const ids = names.map((n) => providerIdByBase[n]).filter((n): n is number => typeof n === 'number' && n > 0);
      if (ids.length > 0) params.set('providers', ids.join(','));
    } else {
      params.set('providers', 'none');
    }
    router.push(`/discover?${params.toString()}`);
  }, [filters, batchSize, providerIdByBase, router]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SECTION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setActiveSections(parsed.filter((s) => typeof s === 'string'));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(activeSections));
    } catch { /* ignore */ }
  }, [activeSections]);

  const loadRows = useCallback(async (mode: 'initial' | 'refresh', sections: string[]) => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    try {
      const res = await browseApi.get(sections);
      setRows(res.data.rows || []);
    } catch {
      if (mode === 'initial') addToast('Failed to load browse');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast]);

  const refreshRow = useCallback(async (rowId: string) => {
    try {
      const res = await browseApi.get([rowId]);
      const fresh = (res.data.rows || []).find((r: BrowseRow) => r.id === rowId);
      if (!fresh) return;
      setRows((prev) => prev.map((r) => (r.id === rowId ? fresh : r)));
    } catch {
      addToast('Failed to refresh');
    }
  }, [addToast]);

  useEffect(() => {
    loadRows('initial', activeSections);
  }, [loadRows, activeSections]);

  const toggleSection = useCallback((key: string) => {
    setActiveSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const clearSections = useCallback(() => setActiveSections([]), []);

  const activeSet = useMemo(() => new Set(activeSections), [activeSections]);

  const handleAddRecommendation = async (rec: SearchResult) => {
    try {
      await movieApi.add(rec.tmdbId);
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          movies: r.movies.filter((m) => m.tmdbId !== rec.tmdbId),
        })).filter((r) => r.movies.length > 0),
      );
      setRecDetail(null);
      addToast(`Added "${rec.title}" to your watchlist`);
    } catch {
      addToast('Failed to add movie');
    }
  };

  return (
    <motion.div
      key="browse"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-4"
    >
      {/* Discover hero */}
      <div className="space-y-3">
        <div className="glass rounded-2xl p-4 space-y-3">
          <div>
            <h2 className="text-lg font-semibold font-display">Discover</h2>
            <p className="text-cream-dim text-xs">Swipe through a fresh, filtered pool.</p>
          </div>
          <FilterSummary
            filters={filters}
            onEdit={() => setShowFilters(!showFilters)}
            onClear={clearFilters}
            open={showFilters}
          />
          <button
            onClick={handleStartDiscover}
            className="w-full py-3 bg-coral text-charcoal font-semibold rounded-xl text-sm hover:bg-coral-dark transition-colors"
          >
            Start discovering
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <FilterEditor
                filters={filters}
                onChange={setFilters}
                streamingProviders={streamingProviders}
                confirmedProviderNames={confirmedProviderNames}
                batchSize={batchSize}
                onBatchSizeChange={setBatchSize}
                providersExpanded={providersExpanded}
                onProvidersExpandedChange={setProvidersExpanded}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Header */}
      <div className="glass rounded-2xl p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold font-display">Sections</h2>
          <p className="text-cream-dim text-xs">
            {activeSections.length > 0
              ? `Showing ${activeSections.length} pinned section${activeSections.length === 1 ? '' : 's'}`
              : 'Pin some chips to explore movies outside your library'}
          </p>
        </div>
        <button
          onClick={() => loadRows('refresh', activeSections)}
          disabled={refreshing}
          className="text-cream-dim text-xs hover:text-cream transition-colors disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Section chips */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-cream-dim text-xs">Pin sections you want to see</p>
          {activeSections.length > 0 && (
            <button
              onClick={clearSections}
              className="text-danger text-xs hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {EDITORIAL_CHIPS.map((chip) => (
            <ChipButton key={chip.key} chip={chip} active={activeSet.has(chip.key)} onToggle={toggleSection} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {GENRE_CHIPS.map((chip) => (
            <ChipButton key={chip.key} chip={chip} active={activeSet.has(chip.key)} onToggle={toggleSection} />
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-5">
          {[0, 1, 2].map((i) => (
            <BrowseRowSkeleton key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-cream-dim text-sm">
            {activeSections.length > 0
              ? 'Your pinned sections are empty — try different chips or clear them.'
              : 'Nothing to browse right now — try again in a minute.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {rows.map((row) => (
            <BrowseRowView
              key={row.id}
              row={row}
              onSelect={(rec) => setRecDetail(rec)}
              onQuickAdd={handleAddRecommendation}
              onRefresh={() => refreshRow(row.id)}
            />
          ))}
        </div>
      )}

      {/* Rec Detail Sheet */}
      <RecDetailSheet
        rec={recDetail}
        onClose={() => setRecDetail(null)}
        onAdd={handleAddRecommendation}
      />
    </motion.div>
  );
}

function ChipButton({
  chip,
  active,
  onToggle,
}: {
  chip: SectionChip;
  active: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(chip.key)}
      className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 ${
        active ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
      }`}
    >
      {chip.label}
    </button>
  );
}

function BrowseRowView({
  row,
  onSelect,
  onQuickAdd,
  onRefresh,
}: {
  row: BrowseRow;
  onSelect: (rec: SearchResult) => void;
  onQuickAdd: (rec: SearchResult) => void;
  onRefresh: () => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [row.movies]);
  if (row.movies.length === 0) return null;
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-danger uppercase tracking-wider">{row.title}</h3>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-cream-dim text-xs hover:text-cream transition-colors disabled:opacity-50 flex items-center gap-1"
          aria-label={`Refresh ${row.title}`}
          title="Refresh this section"
        >
          <svg
            className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {row.movies.map((rec) => (
          <div
            key={rec.tmdbId}
            className="flex-shrink-0 w-28 snap-start group cursor-pointer"
            onClick={() => onSelect(rec)}
          >
            <div className="relative w-28 aspect-[2/3] rounded-xl overflow-hidden bg-card mb-2 shadow-lg group-hover:shadow-coral/20 group-hover:scale-[1.03] transition-all">
              <MoviePoster posterUrl={rec.posterUrl} title={rec.title} />
              {rec.inCinema && (
                <div className="absolute top-1.5 left-1.5">
                  <InCinemaBadge size="sm" />
                </div>
              )}
              <button
                type="button"
                aria-label={`Add ${rec.title} to watchlist`}
                disabled={adding.has(rec.tmdbId)}
                onClick={(e) => {
                  e.stopPropagation();
                  setAdding((prev) => new Set(prev).add(rec.tmdbId));
                  onQuickAdd(rec);
                }}
                className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-coral text-charcoal flex items-center justify-center shadow-lg hover:bg-coral-dark active:scale-90 transition-all disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            <p className="text-xs font-medium truncate">{rec.title}</p>
            <p className="text-cream-dim text-[10px]">
              {rec.year}
              {rec.rating ? ` · ${rec.rating.toFixed(1)}★` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrowseRowSkeleton() {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="h-3 w-40 bg-card-hover rounded-full mb-4 animate-pulse" />
      <div className="flex gap-3 overflow-hidden -mx-1 px-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-shrink-0 w-28">
            <div className="w-28 aspect-[2/3] rounded-xl bg-card-hover animate-pulse" />
            <div className="mt-2 h-2.5 w-3/4 bg-card-hover rounded-full animate-pulse" />
            <div className="mt-1 h-2 w-1/2 bg-card-hover rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
