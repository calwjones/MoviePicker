interface Props {
  className?: string;
  size?: number;
  title?: string;
}

export default function MatchstickLogo({ className = '', size = 32, title = 'Matchsticked' }: Props) {
  return (
    <svg
      width={size}
      height={(size * 80) / 64}
      viewBox="0 0 64 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id="ms-flame" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#FFF4D6" />
          <stop offset="0.45" stopColor="#FFB347" />
          <stop offset="1" stopColor="#A12F0A" />
        </linearGradient>
        <linearGradient id="ms-flame-core" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#FFF4D6" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFB347" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ms-stick" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9A8F80" />
          <stop offset="0.45" stopColor="#F0E6D3" />
          <stop offset="1" stopColor="#7A6F60" />
        </linearGradient>
        <radialGradient id="ms-head" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#D04420" />
          <stop offset="0.6" stopColor="#A12F0A" />
          <stop offset="1" stopColor="#5A1A05" />
        </radialGradient>
      </defs>

      {/* Flame outer */}
      <path
        d="M32 4
           C 24 14, 20 22, 23 30
           C 24 26, 27 23, 29 21
           C 30 25, 33 27, 33 32
           C 41 27, 42 18, 32 4 Z"
        fill="url(#ms-flame)"
      />
      {/* Flame inner core */}
      <path
        d="M32 14
           C 28 20, 27 25, 29 30
           C 30 27, 31 25, 32 23
           C 33 25, 34 27, 34 30
           C 37 26, 36 20, 32 14 Z"
        fill="url(#ms-flame-core)"
      />

      {/* Match head */}
      <ellipse cx="32" cy="36" rx="6" ry="9" fill="url(#ms-head)" />

      {/* Stick */}
      <rect x="29.5" y="42" width="5" height="34" rx="1.6" fill="url(#ms-stick)" />
      {/* Stick grain */}
      <line x1="32" y1="44" x2="32" y2="74" stroke="#7A6F60" strokeWidth="0.5" opacity="0.4" />
    </svg>
  );
}
