'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import MoviePoster from '@/components/MoviePoster';
import { popularApi, movieApi } from '@/lib/api';
import type { SearchResult } from '@matchsticked/shared';

interface OnboardingSeedGridProps {
  onDone: () => void;
  onSkip: () => void;
  ctaPrefix?: string;
}

export default function OnboardingSeedGrid({
  onDone,
  onSkip,
  ctaPrefix = 'Add',
}: OnboardingSeedGridProps) {
  const [movies, setMovies] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await popularApi.allTime();
        if (cancelled) return;
        const list = (res.data.movies ?? []) as SearchResult[];
        setMovies(list.slice(0, 30));
        setLoading(false);
      } catch {
        if (cancelled) return;
        setLoadError('Could not load picks. Try again or skip.');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = (tmdbId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId);
      else next.add(tmdbId);
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.size === 0) {
      onSkip();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const results = await Promise.allSettled(
        Array.from(selected).map((tmdbId) => movieApi.add(tmdbId)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0 && failed === results.length) {
        setSaveError('Could not save any picks. Try again.');
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const count = selected.size;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2
          className="text-2xl font-bold text-cream mb-1"
          style={{ fontFamily: 'var(--font-playfair)' }}
        >
          Seed your watchlist
        </h2>
        <p className="text-cream-dim text-sm">
          Tap any you&apos;d happily watch. We&apos;ll add them all.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] rounded-lg bg-card-hover animate-pulse"
            />
          ))}
        </div>
      ) : loadError ? (
        <p className="text-cream-dim text-xs text-center py-6">{loadError}</p>
      ) : movies.length === 0 ? (
        <p className="text-cream-dim text-xs text-center py-6">
          Nothing to show — your library might already cover the popular picks.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[52vh] overflow-y-auto pr-1">
          {movies.map((m) => {
            const active = selected.has(m.tmdbId);
            return (
              <motion.button
                key={m.tmdbId}
                whileTap={{ scale: 0.94 }}
                onClick={() => toggle(m.tmdbId)}
                className={`relative aspect-[2/3] rounded-lg overflow-hidden group ${
                  active ? 'ring-2 ring-coral' : 'ring-1 ring-cream/10'
                }`}
              >
                <MoviePoster posterUrl={m.posterUrl} title={m.title} />
                <div
                  className={`absolute inset-0 transition-colors ${
                    active
                      ? 'bg-coral/25'
                      : 'bg-charcoal/0 group-hover:bg-charcoal/20'
                  }`}
                />
                {active && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-coral text-charcoal flex items-center justify-center text-xs font-bold">
                    ✓
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-charcoal/95 to-transparent p-1.5">
                  <p className="text-[10px] font-semibold text-cream truncate leading-tight">
                    {m.title}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {saveError && (
        <p className="text-danger text-xs text-center">{saveError}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-coral text-charcoal rounded-xl font-semibold hover:bg-coral-dark transition-colors disabled:opacity-60"
      >
        {saving
          ? 'Adding…'
          : count === 0
            ? 'Skip for now'
            : `${ctaPrefix} ${count} movie${count === 1 ? '' : 's'}`}
      </button>
      {count === 0 && !saving && (
        <button
          onClick={onSkip}
          className="w-full py-2 text-cream-dim/70 text-xs hover:text-cream transition-colors"
        >
          Or skip this step
        </button>
      )}
    </div>
  );
}
