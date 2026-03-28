'use client';

import { useState } from 'react';

interface MoviePosterProps {
  posterUrl: string | null;
  title: string;
  className?: string;
}

export default function MoviePoster({ posterUrl, title, className = '' }: MoviePosterProps) {
  const [loaded, setLoaded] = useState(false);

  if (posterUrl) {
    return (
      <img
        src={posterUrl}
        alt={title}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
      />
    );
  }
  return (
    <div className={`w-full h-full bg-card flex items-center justify-center p-2 text-center ${className}`}>
      <span className="text-cream-dim text-xs">{title}</span>
    </div>
  );
}
