export type TmdbPosterSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780';

const SIZE_SEGMENT = /\/t\/p\/(?:w\d+|original)\//;
const SRCSET_SIZES: { size: TmdbPosterSize; width: number }[] = [
  { size: 'w185', width: 185 },
  { size: 'w342', width: 342 },
  { size: 'w500', width: 500 },
  { size: 'w780', width: 780 },
];

function isTmdbImage(url: string): boolean {
  return url.includes('image.tmdb.org') && SIZE_SEGMENT.test(url);
}

/** Rewrite a TMDB image URL to another size. Non-TMDB URLs pass through untouched. */
export function tmdbImage(url: string, size: TmdbPosterSize): string {
  return isTmdbImage(url) ? url.replace(SIZE_SEGMENT, `/t/p/${size}/`) : url;
}

/** `srcset` across TMDB's poster sizes so the browser fetches only what the layout needs. */
export function posterSrcSet(url: string): string | undefined {
  if (!isTmdbImage(url)) return undefined;
  return SRCSET_SIZES.map(({ size, width }) => `${tmdbImage(url, size)} ${width}w`).join(', ');
}

/** Typical grid thumbnail width: 3 columns on phones, ~6 on desktop. */
export const GRID_POSTER_SIZES = '(min-width: 1024px) 170px, (min-width: 640px) 25vw, 34vw';
/** Full-width swipe card, capped at the card's max-w-lg. */
export const CARD_POSTER_SIZES = '(min-width: 640px) 512px, 100vw';
