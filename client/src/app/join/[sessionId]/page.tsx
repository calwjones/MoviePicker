'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { guestApi } from '@/lib/api';

export default function JoinPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await guestApi.join(sessionId, displayName.trim());
      // Store user token if present so it can be restored after guest session
      const existingToken = localStorage.getItem('token');
      if (existingToken) {
        localStorage.setItem('user_token_backup', existingToken);
      }
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('guest_session_id', sessionId);
      router.push(`/session/${sessionId}`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || 'Failed to join session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-playfair)' }}>
            Join Session
          </h1>
          <p className="text-cream-dim">Enter your name to start swiping</p>
        </div>

        <form onSubmit={handleJoin} className="glass rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-cream-dim text-sm mb-2">Your name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex"
              maxLength={30}
              autoFocus
              className="w-full px-4 py-3 bg-charcoal border border-card-hover rounded-xl text-cream placeholder-cream-dim/50 focus:outline-none focus:border-coral"
            />
          </div>

          {error && (
            <p className="text-danger text-sm text-center">{error}</p>
          )}

          <motion.button
            whileHover={displayName.trim() ? { scale: 1.02 } : {}}
            whileTap={displayName.trim() ? { scale: 0.98 } : {}}
            type="submit"
            disabled={loading || !displayName.trim()}
            className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Joining...' : 'Join & Swipe'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
