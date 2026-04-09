'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { guestApi, sessionApi } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';

type LobbyState = 'loading' | 'join' | 'waiting' | 'starting';

export default function JoinPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [lobbyState, setLobbyState] = useState<LobbyState>('loading');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hostName, setHostName] = useState<string | null>(null);

  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    fetch(`${API_BASE}/sessions/${sessionId}/preview`)
      .then((r) => r.json())
      .then((data) => { if (data.hostName) setHostName(data.hostName); })
      .catch(() => {}); // non-critical
  }, [sessionId]);

  useEffect(() => {
    if (!authLoading) setLobbyState('join');
  }, [authLoading]);

  useEffect(() => {
    if (lobbyState !== 'waiting') return;

    connectSocket();
    const socket = getSocket();
    socket.emit('join-session', sessionId);

    const rejoin = () => socket.emit('join-session', sessionId);
    socket.on('connect', rejoin);

    socket.on('session-started', () => {
      setLobbyState('starting');
      setTimeout(() => router.replace(`/session/${sessionId}`), 500);
    });

    return () => {
      socket.off('connect', rejoin);
      socket.off('session-started');
    };
  }, [lobbyState, sessionId, router]);

  const handleJoinAsGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await guestApi.join(sessionId, displayName.trim());
      const existing = localStorage.getItem('token');
      if (existing) localStorage.setItem('user_token_backup', existing);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('guest_session_id', sessionId);
      setLobbyState('waiting');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to join');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinWithAccount = async () => {
    setSubmitting(true);
    setError('');
    try {
      await sessionApi.joinGroup(sessionId);
      setLobbyState('waiting');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg === 'Session has already started') {
        router.replace(`/session/${sessionId}`);
        return;
      }
      setError(msg || 'Failed to join');
    } finally {
      setSubmitting(false);
    }
  };

  if (lobbyState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-10 h-10 border-3 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold mb-2"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            {hostName ? `Join ${hostName}'s session` : 'Join Session'}
          </h1>
          <p className="text-cream-dim text-sm">
            {lobbyState === 'waiting'
              ? 'Waiting for the host to start...'
              : 'Pick a movie together'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {/* Waiting / lobby */}
          {lobbyState === 'waiting' || lobbyState === 'starting' ? (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass rounded-2xl p-8 flex flex-col items-center gap-4"
            >
              <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
              <p className="text-cream-dim text-sm">
                {lobbyState === 'starting' ? 'Starting...' : 'Waiting for host to start the session'}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="join"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass rounded-2xl p-6 space-y-4"
            >
              {/* Logged-in path */}
              {user && !user.isGuest ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-charcoal rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-coral flex items-center justify-center text-charcoal font-bold text-sm">
                      {user.displayName[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-cream text-sm font-medium">{user.displayName}</p>
                      <p className="text-cream-dim text-xs">Your watchlist will be merged</p>
                    </div>
                  </div>

                  {error && <p className="text-danger text-sm text-center">{error}</p>}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleJoinWithAccount}
                    disabled={submitting}
                    className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Joining...' : 'Join & Swipe'}
                  </motion.button>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-card-hover" />
                    <span className="text-cream-dim text-xs">or join without account</span>
                    <div className="flex-1 h-px bg-card-hover" />
                  </div>
                </div>
              ) : null}

              {/* Guest path — always shown when not logged in; shown as secondary when logged in */}
              <form onSubmit={handleJoinAsGuest} className="space-y-3">
                <div>
                  <label className="block text-cream-dim text-sm mb-2">
                    {user && !user.isGuest ? 'Your name (guest)' : 'Your name'}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Alex"
                    maxLength={30}
                    autoFocus={!user || !!user.isGuest}
                    className="w-full px-4 py-3 bg-charcoal border border-card-hover rounded-xl text-cream placeholder-cream-dim/50 focus:outline-none focus:border-coral"
                  />
                </div>

                {(!user || user.isGuest) && error && (
                  <p className="text-danger text-sm text-center">{error}</p>
                )}

                <motion.button
                  whileHover={displayName.trim() ? { scale: 1.02 } : {}}
                  whileTap={displayName.trim() ? { scale: 0.98 } : {}}
                  type="submit"
                  disabled={submitting || !displayName.trim()}
                  className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Joining...' : 'Join as Guest'}
                </motion.button>

                {(!user || user.isGuest) && (
                  <p className="text-center text-xs text-cream-dim">
                    Have an account?{' '}
                    <button
                      type="button"
                      onClick={() => router.push(`/auth?mode=login&redirect=/join/${sessionId}`)}
                      className="text-coral hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                )}
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
