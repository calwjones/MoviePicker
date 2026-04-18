interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export default function MatchStrikeLoader({ size = 140, className = '', label = 'Loading' }: Props) {
  return (
    <svg
      width={size}
      height={(size * 100) / 140}
      viewBox="0 0 140 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="msl-flame" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#FFF4D6" />
          <stop offset="0.5" stopColor="#FFB347" />
          <stop offset="1" stopColor="#A12F0A" />
        </linearGradient>
        <linearGradient id="msl-flame-core" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#FFF4D6" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFB347" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="msl-stick" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9A8F80" />
          <stop offset="0.45" stopColor="#F0E6D3" />
          <stop offset="1" stopColor="#7A6F60" />
        </linearGradient>
        <radialGradient id="msl-head" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#D04420" />
          <stop offset="0.6" stopColor="#A12F0A" />
          <stop offset="1" stopColor="#3A0F02" />
        </radialGradient>
        <linearGradient id="msl-box" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262626" />
          <stop offset="1" stopColor="#141414" />
        </linearGradient>
        <pattern id="msl-strip" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="#5A1A05" />
          <circle cx="1" cy="1" r="0.5" fill="#A12F0A" opacity="0.6" />
          <circle cx="2.2" cy="2.2" r="0.4" fill="#7A2308" />
        </pattern>
      </defs>

      {/* Matchbox */}
      <g>
        <rect x="20" y="76" width="100" height="20" rx="2" fill="url(#msl-box)" />
        <rect x="20" y="76" width="100" height="2" fill="#3A3A3A" opacity="0.6" />
        {/* Strike strip */}
        <rect x="24" y="78" width="92" height="6" rx="1" fill="url(#msl-strip)" />
        <rect x="24" y="78" width="92" height="6" rx="1" fill="#000" opacity="0.15" />
      </g>

      {/* Sparks at strike-end point */}
      <g className="ms-sparks" transform="translate(38 75)">
        <circle cx="0" cy="0" r="1.4" fill="#FFB347" />
        <circle cx="-4" cy="-3" r="1" fill="#FFF4D6" />
        <circle cx="4" cy="-2" r="1.2" fill="#FFB347" />
        <circle cx="-2" cy="-6" r="0.9" fill="#FFF4D6" />
        <circle cx="6" cy="-5" r="0.8" fill="#A12F0A" />
        <circle cx="-6" cy="-1" r="0.7" fill="#FFB347" />
        <circle cx="2" cy="-9" r="0.6" fill="#FFF4D6" />
      </g>

      {/* Match — local origin at head center; stick extends upward (-y) */}
      <g className="ms-match">
        {/* Stick */}
        <rect x="-2" y="-38" width="4" height="32" rx="1.2" fill="url(#msl-stick)" />
        <line x1="0" y1="-36" x2="0" y2="-8" stroke="#7A6F60" strokeWidth="0.4" opacity="0.45" />
        {/* Head */}
        <ellipse cx="0" cy="-4" rx="4.5" ry="6" fill="url(#msl-head)" />
        {/* Flame group */}
        <g className="ms-flame">
          <path
            d="M0 -32
               C -6 -24, -8 -18, -6 -12
               C -5 -15, -3 -17, -1 -19
               C 0 -16, 2 -14, 2 -10
               C 7 -14, 8 -22, 0 -32 Z"
            fill="url(#msl-flame)"
            transform="translate(0 -8)"
          />
          <g className="ms-flame-core">
            <path
              d="M0 -28
                 C -3 -22, -4 -18, -2 -14
                 C -1 -16, 0 -18, 0 -19
                 C 1 -17, 2 -16, 2 -13
                 C 4 -16, 4 -22, 0 -28 Z"
              fill="url(#msl-flame-core)"
              transform="translate(0 -8)"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
