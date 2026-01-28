'use client';

interface MoviePosterProps {
  posterUrl: string | null;
  title: string;
  className?: string;
}

export default function MoviePoster({ posterUrl, title, className = '' }: MoviePosterProps) {
  if (posterUrl) {
    return <img src={posterUrl} alt={title} className={`w-full h-full object-cover ${className}`} />;
  }
  return (
    <div className={`w-full h-full bg-card flex items-center justify-center p-2 text-center ${className}`}>
      <span className="text-cream-dim text-xs">{title}</span>
    </div>
  );
}
