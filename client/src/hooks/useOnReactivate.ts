import { useEffect, useRef } from 'react';

/**
 * Run `fn` each time `active` flips from false to true (not on first mount).
 * Kept-alive dashboard tabs use it to refresh quietly when you come back to them.
 */
export function useOnReactivate(active: boolean | undefined, fn: () => void): void {
  const fnRef = useRef(fn);
  const wasActive = useRef(active);

  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (active && wasActive.current === false) fnRef.current();
    wasActive.current = active;
  }, [active]);
}
