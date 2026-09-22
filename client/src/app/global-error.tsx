'use client';

// Last resort when the root layout itself fails: no app CSS or fonts are
// guaranteed here, so styles are inline and self-contained.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D0D0D', color: '#F0E6D3', fontFamily: 'Georgia, serif' }}>
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>That one fizzled out</h1>
          <p style={{ color: '#B8AFA3', fontFamily: 'system-ui, sans-serif', margin: '0 0 24px' }}>
            Matchsticked hit an unexpected error. Try again in a moment.
          </p>
          <button
            onClick={reset}
            style={{ background: '#A12F0A', color: '#F0E6D3', border: 0, borderRadius: 12, padding: '12px 24px', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
