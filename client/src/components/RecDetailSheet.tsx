'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { movieApi } from '@/lib/api';
import type { Movie, SearchResult } from '@shared/types';
import MoviePoster from './MoviePoster';
import StreamingProvidersList from './StreamingProviders';

interface RecDetailSheetProps {
  rec: SearchResult | null;
  onClose: () => void;
  onAdd: (rec: SearchResult) => void | Promise<void>;
  onDismiss?: (rec: SearchResult) => void | Promise<void>;
}

export default function RecDetailSheet({ rec, onClose, onAdd, onDismiss }: RecDetailSheetProps) {
  const [full, setFull] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rec) {
      setFull(null);
      return;
    }
    setFull(null);
    setLoading(true);
    movieApi.getByTmdbId(rec.tmdbId)
      .then((res) => setFull(res.data.movie))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [rec]);

  useEffect(() => {
    if (!rec) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [rec, onClose]);

  useEffect(() => {
    if (!rec) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [rec]);

  return (
    <AnimatePresence>
      {rec && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="glass rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {rec.seedTitles && rec.seedTitles.length > 0 && (
              <p className="text-xs text-cream-dim mb-3">
                Because you liked{' '}
                {rec.seedTitles.map((t, i) => (
                  <span key={t}>
                    <span className="text-cream">{t}</span>
                    {i < rec.seedTitles!.length - 1 ? ' and ' : ''}
                  </span>
                ))}
              </p>
            )}
            <div className="flex gap-4 mb-4">
              <div className="w-24 h-36 rounded-xl overflow-hidden flex-shrink-0">
                <MoviePoster posterUrl={rec.posterUrl} title={rec.title} />
              </div>
              <div>
                <h2 className="text-xl font-semibold font-display">{rec.title}</h2>
                <p className="text-cream-dim text-sm mt-1">
                  {rec.year}
                  {rec.rating ? ` · ${rec.rating.toFixed(1)}★` : ''}
                </p>
                {full?.director && (
                  <p className="text-cream-dim text-sm mt-1">
                    Directed by <span className="text-cream">{full.director}</span>
                  </p>
                )}
                {loading && !full && (
                  <p className="text-cream-dim text-xs mt-2 animate-pulse">Loading details…</p>
                )}
              </div>
            </div>
            {rec.overview && (
              <p className="text-cream-dim text-sm mb-4">{rec.overview}</p>
            )}
            {full?.streamingProviders && full.streamingProviders.length > 0 && (
              <div className="mb-4">
                <StreamingProvidersList providers={full.streamingProviders} />
              </div>
            )}
            <div className="flex gap-3">
              {onDismiss ? (
                <button
                  onClick={async () => { await onDismiss(rec); onClose(); }}
                  className="flex-1 py-3 glass rounded-xl text-cream-dim hover:text-coral transition-colors text-sm font-medium"
                >
                  Not interested
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="flex-1 py-3 glass rounded-xl text-cream-dim hover:text-cream transition-colors"
                >
                  Close
                </button>
              )}
              <button
                onClick={() => onAdd(rec)}
                className="flex-1 py-3 bg-coral text-charcoal rounded-xl font-medium text-sm hover:bg-coral/90 transition-colors"
              >
                Add to Watchlist
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
