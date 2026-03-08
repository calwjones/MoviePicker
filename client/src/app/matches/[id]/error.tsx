'use client';

import ErrorFallback from '@/components/ErrorFallback';

export default function MatchesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Couldn't load matches"
      message="We couldn't pull up the match results. Try again in a moment."
    />
  );
}
