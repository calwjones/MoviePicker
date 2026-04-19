'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { browseApi, movieApi } from '@/lib/api';
import MoviePoster from '@/components/MoviePoster';
import InCinemaBadge from '@/components/InCinemaBadge';
import RecDetailSheet from '@/components/RecDetailSheet';
import type { SearchResult } from '@shared/types';

interface BrowseRow {
  id: string;
  title: string;
  movies: SearchResult[];
}

interface BrowseTabProps {
  addToast: (message: string) => void;
}

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

export default function BrowseTab({ addToast }: BrowseTabProps) {
  const [rows, setRows] = useState<BrowseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recDetail, setRecDetail] = useState<SearchResult | null>(null);
  const [activeSections, setActiveSections] = useState<string[]>([]);

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
      {/* Header */}
      <div className="glass rounded-2xl p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold font-display">Browse</h2>
          <p className="text-cream-dim text-xs">
            {activeSections.length > 0
              ? `Showing ${activeSections.length} pinned section${activeSections.length === 1 ? '' : 's'}`
              : 'Discover movies outside your library'}
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

function BrowseRowView({ row, onSelect }: { row: BrowseRow; onSelect: (rec: SearchResult) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [row.movies]);
  if (row.movies.length === 0) return null;
  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-danger uppercase tracking-wider mb-3">{row.title}</h3>
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
