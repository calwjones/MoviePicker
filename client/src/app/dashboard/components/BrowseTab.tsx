'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

export default function BrowseTab({ addToast }: BrowseTabProps) {
  const [rows, setRows] = useState<BrowseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recDetail, setRecDetail] = useState<SearchResult | null>(null);

  const loadRows = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    try {
      const res = await browseApi.get();
      setRows(res.data.rows || []);
    } catch {
      if (mode === 'initial') addToast('Failed to load browse');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadRows('initial');
  }, [loadRows]);

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
          <p className="text-cream-dim text-xs">Discover movies outside your library</p>
        </div>
        <button
          onClick={() => loadRows('refresh')}
          disabled={refreshing}
          className="text-cream-dim text-xs hover:text-cream transition-colors disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="space-y-5">
          {[0, 1, 2].map((i) => (
            <BrowseRowSkeleton key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-cream-dim text-sm">Nothing to browse right now — try again in a minute.</p>
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
