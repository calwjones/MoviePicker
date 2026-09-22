'use client';

import { useState } from 'react';
import { GRID_POSTER_SIZES, posterSrcSet, tmdbImage } from '@/lib/tmdbImage';

interface MoviePosterProps {
  posterUrl: string | null;
  title: string;
  className?: string;
  /** Rendered width hint for srcset selection. Defaults to a grid thumbnail. */
  sizes?: string;
  /** Load immediately instead of when scrolled near (use for above-the-fold art). */
  eager?: boolean;
}

export default function MoviePoster({ posterUrl, title, className = '', sizes = GRID_POSTER_SIZES, eager = false }: MoviePosterProps) {
  const [loaded, setLoaded] = useState(false);

  if (!posterUrl) {
    return (
      <div className={`w-full h-full bg-card flex items-center justify-center p-2 text-center ${className}`}>
        <span className="text-cream-dim text-xs">{title}</span>
      </div>
    );
  }

  const blurUrl = posterUrl.includes('image.tmdb.org') ? tmdbImage(posterUrl, 'w92') : null;
  const loading = eager ? 'eager' : 'lazy';

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {blurUrl && (
        <img
          src={blurUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading={loading}
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl pointer-events-none select-none"
        />
      )}
      <img
        src={posterUrl}
        srcSet={posterSrcSet(posterUrl)}
        sizes={sizes}
        alt={title}
        loading={loading}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 pointer-events-none select-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
