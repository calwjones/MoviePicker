'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import MatchstickLogo from './MatchstickLogo';

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  message?: string;
  showHome?: boolean;
}

export default function ErrorFallback({
  error,
  reset,
  title = 'That one fizzled out',
  message = 'Something went wrong on our side. Give it another go, and if it keeps happening, head back to your dashboard.',
  showHome = true,
}: ErrorFallbackProps) {
  useEffect(() => {
    console.error('[ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="max-w-md w-full glass rounded-2xl p-8 text-center space-y-4">
        <MatchstickLogo size={36} decorative className="mx-auto opacity-60 grayscale" />
        <h1 className="text-2xl font-bold text-cream" style={{ fontFamily: 'var(--font-playfair)' }}>
          {title}
        </h1>
        <p className="text-cream-dim text-sm">{message}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-coral hover:bg-coral-dark text-cream rounded-xl font-medium transition-colors"
          >
            Try again
          </button>
          {showHome && (
            <Link
              href="/dashboard"
              className="px-6 py-2.5 glass text-cream hover:bg-card-hover rounded-xl font-medium transition-colors"
            >
              Back to dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
