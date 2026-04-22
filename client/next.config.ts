import type { NextConfig } from "next";

function safeOrigin(url: string, fallback: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return fallback;
  }
}

const API_ORIGIN = safeOrigin(
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  'http://localhost:3001',
);
const SOCKET_ORIGIN = safeOrigin(
  process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001',
  'http://localhost:3001',
);
const WS_ORIGIN = SOCKET_ORIGIN.replace(/^http/, 'ws');

const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  // 'unsafe-inline' is required for Next.js bootstrap + inline hydration scripts.
  // Migrate to nonces if/when moving off App Router defaults.
  'script-src': ["'self'", "'unsafe-inline'", 'https://va.vercel-scripts.com'],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:', 'https://image.tmdb.org', 'https://*.ltrbxd.com'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", API_ORIGIN, SOCKET_ORIGIN, WS_ORIGIN, 'https://va.vercel-scripts.com'],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
};

const CSP = Object.entries(CSP_DIRECTIVES)
  .map(([k, v]) => `${k} ${v.join(' ')}`)
  .join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@matchsticked/shared'],
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
};

export default nextConfig;
