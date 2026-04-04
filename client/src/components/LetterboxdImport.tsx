'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { importApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const LOADING_STAGES = [
  'Fetching your watchlist…',
  'Reading your ratings…',
  'Matching movies to TMDb…',
  'Saving to your library…',
  'Almost there, hang tight…',
];

interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  total: number;
  errors: string[];
}

interface LetterboxdImportProps {
  mode: 'onboarding' | 'library';
  onSuccess?: (result: ImportResult) => void;
  onSkip?: () => void;
}

const USERNAME_RE = /^[A-Za-z0-9_-]{1,30}$/;

const ERROR_COPY: Record<string, string> = {
  profile_not_found: "Couldn't find that Letterboxd profile. Check the spelling.",
  profile_private: 'That profile is private. Make it public in your Letterboxd settings.',
  rate_limited: "Letterboxd is rate-limiting us right now. Try again in a few minutes.",
  markup_error: "We're having trouble reading Letterboxd right now, we're on it. Try again later.",
  invalid_username: 'Username can only contain letters, numbers, underscores, and hyphens.',
};

export default function LetterboxdImport({ mode, onSuccess, onSkip }: LetterboxdImportProps) {
  const { user, setLetterboxdUsername } = useAuth();
  const stored = user?.letterboxdUsername ?? '';
  const [username, setUsername] = useState(stored);
  const [editing, setEditing] = useState(mode === 'onboarding' || !stored);
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!loading) {
      setStageIndex(0);
      setProgress(0);
      return;
    }
    const stageTimer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, LOADING_STAGES.length - 1));
    }, 8000);
    const progressTimer = setInterval(() => {
      setProgress((p) => (p < 92 ? p + (92 - p) * 0.04 : p));
    }, 500);
    return () => {
      clearInterval(stageTimer);
      clearInterval(progressTimer);
    };
  }, [loading]);

  const hasStored = mode === 'library' && !!stored && !editing;
  const displayUsername = (hasStored ? stored : username).replace(/^@/, '').trim();

  const submit = async () => {
    setError(null);
    setResult(null);
    const clean = displayUsername;
    if (!clean || !USERNAME_RE.test(clean)) {
      setError(ERROR_COPY.invalid_username);
      return;
    }
    setLoading(true);
    try {
      const res = await importApi.letterboxd(clean);
      const data: { results: ImportResult; username?: string } = res.data;
      setResult(data.results);
      setLetterboxdUsername(data.username ?? clean);
      setEditing(false);
      onSuccess?.(data.results);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { code?: string } } };
      const code = e?.response?.data?.code ?? 'markup_error';
      setError(ERROR_COPY[code] ?? ERROR_COPY.markup_error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {mode === 'onboarding' && (
        <p className="text-cream-dim text-sm">
          Already on Letterboxd? Bring your watchlist over, takes a few seconds.
        </p>
      )}

      {hasStored ? (
        <div className="flex items-center justify-between glass rounded-xl px-3 py-2.5">
          <span className="text-sm text-cream">
            <span className="text-cream-dim">@</span>{stored}
          </span>
          <button
            type="button"
            onClick={() => { setEditing(true); setUsername(''); }}
            className="text-xs text-cream-dim hover:text-cream transition-colors"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="flex items-stretch gap-2">
          <div className="flex items-center glass rounded-xl pl-3 pr-1 flex-1">
            <span className="text-cream-dim text-sm">@</span>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username.replace(/^@/, '')}
              onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="your-username"
              className="flex-1 bg-transparent py-2.5 px-2 text-sm outline-none"
              disabled={loading}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="w-full py-3 bg-coral text-charcoal font-semibold rounded-xl text-sm hover:bg-coral-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
              {LOADING_STAGES[stageIndex]}
            </>
          ) : hasStored ? (
            `Sync from @${stored}`
          ) : (
            'Sync'
          )}
        </button>
        {onSkip && !loading && !result && (
          <button
            type="button"
            onClick={onSkip}
            className="w-full py-2.5 text-cream-dim/70 text-xs hover:text-cream transition-colors"
          >
            Skip for now
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-1.5">
          <div className="h-1 glass rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-coral"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <p className="text-cream-dim text-xs">
            This can take up to a minute for large profiles.
          </p>
        </div>
      )}

      {error && (
        <div className="glass rounded-xl p-3 border border-danger/40">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {result && (
        <div className="glass rounded-xl p-3 text-sm">
          <p className="text-cream mb-1">Import complete.</p>
          <p className="text-cream-dim text-xs">
            {result.imported} imported, {result.skipped} skipped, {result.failed} failed (out of {result.total}).
          </p>
          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-cream-dim/80 cursor-pointer">View errors ({result.errors.length})</summary>
              <ul className="mt-1 space-y-0.5 text-xs text-cream-dim/70 max-h-32 overflow-y-auto">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </motion.div>
  );
}
