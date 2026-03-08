'use client';

import ErrorFallback from '@/components/ErrorFallback';

export default function SessionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Session interrupted"
      message="Something went wrong with this swipe session. Try again, or head back to your dashboard."
    />
  );
}
