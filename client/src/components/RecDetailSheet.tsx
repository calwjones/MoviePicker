'use client';

import { useEffect, useState } from 'react';
import { movieApi } from '@/lib/api';
import type { Movie, SearchResult } from '@shared/types';
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
