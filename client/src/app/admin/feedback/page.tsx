'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { feedbackApi, type FeedbackEntry } from '@/lib/api';
import { FullPageSpinner } from '@/components/LoadingSpinner';

export default function AdminFeedbackPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth?mode=login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    feedbackApi.list()
      .then((res) => setEntries(res.data.feedback ?? []))
      .catch((err) => {
        if (err?.response?.status === 403) setError('Not authorized.');
        else setError('Failed to load feedback.');
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading) return <FullPageSpinner />;

  return (
    <div className="min-h-dvh px-6 py-8 w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Feedback</h1>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-cream-dim text-sm hover:text-cream transition-colors"
        >
          Back
        </button>
      </div>

      {loading && <p className="text-cream-dim text-sm">Loading…</p>}
      {error && <p className="text-danger text-sm">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="text-cream-dim text-sm">No feedback yet.</p>
      )}

      <div className="space-y-3">
        {entries.map((e) => (
          <div key={e.id} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-cream-dim mb-2">
              <span>{e.username ?? (e.userId ? e.userId.slice(0, 8) : 'anonymous')}</span>
              <span>{new Date(e.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{e.body}</p>
            {e.page && (
              <p className="text-cream-dim text-[11px] mt-2">page: {e.page}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
