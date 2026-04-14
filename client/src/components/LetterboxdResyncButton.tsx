'use client';

import { useState } from 'react';
import { importApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface Props {
  onSuccess?: () => void;
  onToast?: (message: string) => void;
}

export default function LetterboxdResyncButton({ onSuccess, onToast }: Props) {
  const { user, setLetterboxdUsername } = useAuth();
  const stored = user?.letterboxdUsername ?? '';
  const [loading, setLoading] = useState(false);

  if (!stored) return null;

  const resync = async () => {
    setLoading(true);
    try {
      const res = await importApi.letterboxd(stored);
      const data: { results: { imported: number; total: number }; username?: string } = res.data;
      setLetterboxdUsername(data.username ?? stored);
      onSuccess?.();
      onToast?.(`Resynced @${stored} — ${data.results.imported} new of ${data.results.total}`);
    } catch {
      onToast?.("Couldn't resync Letterboxd. Try again in a bit.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={resync}
      disabled={loading}
      title={`Resync from @${stored}`}
      className="text-xs px-3 py-1.5 rounded-full glass text-cream-dim hover:text-cream hover:bg-card-hover transition-colors flex items-center gap-1.5 disabled:opacity-60"
    >
      {loading ? (
        <>
          <span className="w-3 h-3 border border-cream-dim border-t-transparent rounded-full animate-spin" />
          Resyncing…
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Resync Letterboxd
        </>
      )}
    </button>
  );
}
