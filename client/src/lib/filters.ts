export const SWIPE_FILTERS_STORAGE_KEY = 'moviepicker_filters';

export function clearSwipeFilters(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SWIPE_FILTERS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
