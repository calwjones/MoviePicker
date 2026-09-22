import type { KeyboardEvent } from 'react';

/**
 * Props that make a non-button element behave like one for keyboard and
 * screen-reader users (used where a tile contains its own nested buttons).
 */
export function clickableProps(onActivate: () => void, label: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
