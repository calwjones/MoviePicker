import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MatchSticked',
    short_name: 'MatchSticked',
    description: 'Pick a movie together. No more scrolling debates.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#0D0D0D',
    theme_color: '#0D0D0D',
    categories: ['entertainment', 'lifestyle'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
