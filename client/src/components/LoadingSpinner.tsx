'use client';

import { useEffect, useState } from 'react';
import MatchStrikeLoader from './MatchStrikeLoader';

// Most loads finish well under this; showing the 3s strike animation for a few
// frames reads as a flicker, so the loader only appears if we're still waiting.
const FULL_PAGE_DELAY_MS = 250;

const sizes = {
  sm: 'w-5 h-5 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
};

export default function LoadingSpinner({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`${sizes[size]} border-coral border-t-transparent rounded-full animate-spin`} />
  );
}

export function FullPageSpinner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), FULL_PAGE_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex items-center justify-center min-h-dvh" aria-busy="true">
      {visible && (
        <div className="animate-[fade-in_300ms_ease-out]">
          <MatchStrikeLoader size={160} />
        </div>
      )}
    </div>
  );
}
