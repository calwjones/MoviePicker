'use client';

import { useState } from 'react';

interface MoviePosterProps {
  posterUrl: string | null;
  title: string;
  className?: string;
}

function getBlurUrl(posterUrl: string): string | null {
  if (!posterUrl.includes('image.tmdb.org')) return null;
  return posterUrl.replace(/\/t\/p\/w\d+\//, '/t/p/w92/');
}

export default function MoviePoster({ posterUrl, title, className = '' }: MoviePosterProps) {
  const [loaded, setLoaded] = useState(false);

  if (!posterUrl) {
    return (
      <div className={`w-full h-full bg-card flex items-center justify-center p-2 text-center ${className}`}>
        <span className="text-cream-dim text-xs">{title}</span>
      </div>
    );
  }

  const blurUrl = getBlurUrl(posterUrl);

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {blurUrl && (
        <img
          src={blurUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl pointer-events-none select-none"
        />
      )}
      <img
        src={posterUrl}
        alt={title}
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 pointer-events-none select-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
