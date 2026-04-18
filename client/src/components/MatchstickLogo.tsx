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
          <stop offset="0" stopColor="#FFE7B0" />
          <stop offset="0.45" stopColor="#FF8A1F" />
          <stop offset="1" stopColor="#A12F0A" />
        </linearGradient>
        <linearGradient id="ms-flame-core" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#FFF7DA" stopOpacity="1" />
          <stop offset="0.7" stopColor="#FFB347" stopOpacity="0.7" />
          <stop offset="1" stopColor="#FF8A1F" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ms-stick" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8C7F6E" />
          <stop offset="0.5" stopColor="#F0E6D3" />
          <stop offset="1" stopColor="#6E6354" />
        </linearGradient>
        <radialGradient id="ms-head" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#E25A2E" />
          <stop offset="0.55" stopColor="#A12F0A" />
          <stop offset="1" stopColor="#3D1004" />
        </radialGradient>
        <radialGradient id="ms-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FF8A1F" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FF8A1F" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Warm glow halo behind flame */}
      <circle cx="32" cy="20" r="22" fill="url(#ms-glow)" />

      {/* Flame outer — symmetric teardrop centered on x=32 */}
      <path
        d="M 32 4
           C 28 10, 23 17, 23 24
           C 23 29, 27 32, 32 32
           C 37 32, 41 29, 41 24
           C 41 17, 36 10, 32 4 Z"
        fill="url(#ms-flame)"
      />

      {/* Flame inner core — smaller symmetric teardrop */}
      <path
        d="M 32 13
           C 30 17, 27 21, 27 25
           C 27 29, 29 31, 32 31
           C 35 31, 37 29, 37 25
           C 37 21, 34 17, 32 13 Z"
        fill="url(#ms-flame-core)"
      />

      {/* Match head — sits directly under the flame */}
      <ellipse cx="32" cy="35" rx="7" ry="9" fill="url(#ms-head)" />
      {/* Head highlight */}
      <ellipse cx="29.5" cy="32" rx="2" ry="3" fill="#F0865A" opacity="0.55" />

      {/* Stick — centered on x=32, extends from head to bottom */}
      <rect x="29" y="42" width="6" height="34" rx="2" fill="url(#ms-stick)" />
      <line x1="32" y1="44" x2="32" y2="74" stroke="#5A4F40" strokeWidth="0.5" opacity="0.5" />
    </svg>
  );
}
