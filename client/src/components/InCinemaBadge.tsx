interface InCinemaBadgeProps {
  className?: string;
  size?: 'sm' | 'md';
}

export default function InCinemaBadge({ className = '', size = 'md' }: InCinemaBadgeProps) {
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-cream/10 backdrop-blur-sm text-cream font-medium uppercase tracking-wide border border-cream/20 ${padding} ${className}`}
    >
      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor" aria-hidden="true">
        <path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1H2V4zm0 2h12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6zm2 2v1h1V8H4zm7 0v1h1V8h-1z" />
      </svg>
      In Cinemas
    </span>
  );
}
