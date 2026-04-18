interface Props {
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Match local coords (in SVG units, before transform):
 *   - Head ellipse centered at (0, 0)
 *   - Stick extends DOWN (positive y) from head to (0, 34)
 *   - Flame extends UP (negative y) from head to (0, -22)
 * Animation transforms the whole match group via translate + rotate so
 * the head pivots around its origin during the strike.
 */
export default function MatchStrikeLoader({ size = 160, className = '', label = 'Loading' }: Props) {
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
          <stop offset="0" stopColor="#FFE7B0" />
          <stop offset="0.45" stopColor="#FF8A1F" />
          <stop offset="1" stopColor="#A12F0A" />
        </linearGradient>
        <linearGradient id="msl-flame-core" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#FFF7DA" />
          <stop offset="0.7" stopColor="#FFB347" stopOpacity="0.7" />
          <stop offset="1" stopColor="#FF8A1F" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="msl-stick" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8C7F6E" />
          <stop offset="0.5" stopColor="#F0E6D3" />
          <stop offset="1" stopColor="#6E6354" />
        </linearGradient>
        <radialGradient id="msl-head" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#E25A2E" />
          <stop offset="0.55" stopColor="#A12F0A" />
          <stop offset="1" stopColor="#3D1004" />
        </radialGradient>
        <radialGradient id="msl-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FF8A1F" stopOpacity="0.4" />
          <stop offset="1" stopColor="#FF8A1F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="msl-box-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A2A2A" />
          <stop offset="1" stopColor="#0F0F0F" />
        </linearGradient>
        <linearGradient id="msl-box-strip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7A2308" />
          <stop offset="1" stopColor="#3D1004" />
        </linearGradient>
        <pattern id="msl-grit" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="transparent" />
          <circle cx="1" cy="1" r="0.4" fill="#000" opacity="0.4" />
          <circle cx="3" cy="2.5" r="0.3" fill="#FFE7B0" opacity="0.18" />
          <circle cx="2" cy="3.2" r="0.35" fill="#000" opacity="0.3" />
        </pattern>
      </defs>

      {/* === Matchbox === */}
      <g>
        {/* Box body */}
        <rect x="20" y="76" width="100" height="20" rx="2.5" fill="url(#msl-box-body)" />
        {/* Top edge highlight */}
        <rect x="20" y="76" width="100" height="1" rx="0.5" fill="#3D3D3D" opacity="0.7" />
        {/* Inner shadow under strip */}
        <rect x="22" y="84" width="96" height="1" fill="#000" opacity="0.4" />
        {/* Strike strip */}
        <rect x="24" y="78" width="92" height="6" rx="1" fill="url(#msl-box-strip)" />
        <rect x="24" y="78" width="92" height="6" rx="1" fill="url(#msl-grit)" />
        <rect x="24" y="78" width="92" height="0.5" fill="#FFE7B0" opacity="0.15" />
      </g>

      {/* === Sparks at strike-end point (world coords ~108, 78) === */}
      <g className="ms-sparks" style={{ transformOrigin: '108px 78px' }}>
        <g transform="translate(108 78)">
          <circle cx="-2" cy="-3" r="1.4" fill="#FFE7B0" />
          <circle cx="3" cy="-5" r="1.1" fill="#FF8A1F" />
          <circle cx="-5" cy="-1" r="0.9" fill="#FFE7B0" />
          <circle cx="5" cy="-2" r="0.8" fill="#FFB347" />
          <circle cx="0" cy="-7" r="0.7" fill="#FFF7DA" />
          <circle cx="-3" cy="-6" r="0.6" fill="#FF8A1F" />
          <circle cx="6" cy="-6" r="0.5" fill="#FFE7B0" />
        </g>
      </g>

      {/* === Match (animated as a single group; local origin = head center) === */}
      <g className="ms-match">
        {/* Warm glow behind flame (only meaningful once lit; clipped by ms-flame opacity via its parent) */}
        <g className="ms-flame">
          <circle cx="0" cy="-12" r="16" fill="url(#msl-glow)" />
          {/* Flame outer */}
          <g className="ms-flame-core-wrap">
            <path
              d="M 0 -22
                 C -4 -16, -9 -9, -9 -2
                 C -9 3, -5 6, 0 6
                 C 5 6, 9 3, 9 -2
                 C 9 -9, 4 -16, 0 -22 Z"
              fill="url(#msl-flame)"
            />
            {/* Flame inner core */}
            <path
              d="M 0 -15
                 C -2 -10, -5 -5, -5 -1
                 C -5 3, -2 5, 0 5
                 C 2 5, 5 3, 5 -1
                 C 5 -5, 2 -10, 0 -15 Z"
              fill="url(#msl-flame-core)"
            />
          </g>
        </g>

        {/* Match head */}
        <ellipse cx="0" cy="0" rx="4.5" ry="6" fill="url(#msl-head)" />
        <ellipse cx="-1.5" cy="-2" rx="1.2" ry="1.8" fill="#F0865A" opacity="0.55" />

        {/* Stick — extends DOWN from head */}
        <rect x="-2" y="5" width="4" height="30" rx="1.2" fill="url(#msl-stick)" />
        <line x1="0" y1="7" x2="0" y2="33" stroke="#5A4F40" strokeWidth="0.4" opacity="0.5" />
      </g>
    </svg>
  );
}
