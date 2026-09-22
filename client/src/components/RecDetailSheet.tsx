'use client';

import { useEffect, useState } from 'react';
import { movieApi } from '@/lib/api';
import type { Movie, SearchResult } from '@matchsticked/shared';
import MovieDetailModal from './MovieDetailModal';

interface RecDetailSheetProps {
  rec: SearchResult | null;
  onClose: () => void;
  onAdd: (rec: SearchResult) => void | Promise<void>;
  onDismiss?: (rec: SearchResult) => void | Promise<void>;
}

function recToMovie(rec: SearchResult): Movie {
  return {
    id: '',
    tmdbId: rec.tmdbId,
    title: rec.title,
    year: rec.year,
    posterUrl: rec.posterUrl,
    overview: rec.overview,
    genres: [],
    director: null,
    cast: [],
    runtime: null,
    tmdbRating: rec.rating,
    streamingProviders: [],
    inCinema: rec.inCinema,
  };
}

export default function RecDetailSheet({ rec, onClose, onAdd, onDismiss }: RecDetailSheetProps) {
  // Keyed to the rec it was fetched for, so a slow response for the previous
  // pick can never show under the current one.
  const [fetched, setFetched] = useState<{ tmdbId: number; movie: Movie | null } | null>(null);

  useEffect(() => {
    if (!rec) return;
    let cancelled = false;
    movieApi.getByTmdbId(rec.tmdbId)
      .then((res) => { if (!cancelled) setFetched({ tmdbId: rec.tmdbId, movie: res.data.movie }); })
      .catch(() => { if (!cancelled) setFetched({ tmdbId: rec.tmdbId, movie: null }); });
    return () => { cancelled = true; };
  }, [rec]);

  const current = rec && fetched?.tmdbId === rec.tmdbId ? fetched : null;
  const full = current?.movie ?? null;
  const loading = !!rec && !current;

  const displayMovie = full ?? (rec ? recToMovie(rec) : null);

  return (
    <MovieDetailModal
      movie={displayMovie}
      open={!!rec}
      loading={loading && !full}
      onClose={onClose}
      seedTitles={rec?.seedTitles}
      onAdd={async () => { if (rec) await onAdd(rec); }}
      onDismiss={onDismiss ? async () => { if (rec) await onDismiss(rec); } : undefined}
    />
  );
}
