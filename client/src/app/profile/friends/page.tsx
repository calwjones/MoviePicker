'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { friendsApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ToastContainer';
import { getSocket, connectSocket } from '@/lib/socket';

type Friend = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  friendshipId: string;
};

type Pending = {
  friendshipId: string;
  direction: 'incoming' | 'outgoing';
  other: { id: string; displayName: string; avatarUrl: string | null };
  createdAt: string;
};

type Tab = 'friends' | 'pending' | 'add';

export default function FriendsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toasts, addToast } = useToast();

  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.isGuest)) {
      router.push('/auth?mode=login');
    }
  }, [user, authLoading, router]);

  const refresh = useCallback(async () => {
    try {
      const [friendsRes, pendingRes] = await Promise.all([
        friendsApi.list(),
        friendsApi.pending(),
      ]);
      setFriends(friendsRes.data.friends ?? []);
      setPending(pendingRes.data.pending ?? []);
    } catch {
      addToast('Failed to load friends', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (authLoading || !user || user.isGuest) return;
    refresh();
  }, [authLoading, user, refresh]);

  useEffect(() => {
    if (authLoading || !user || user.isGuest) return;
    connectSocket();
    const socket = getSocket();
    socket.on('friend-request', refresh);
    socket.on('friend-request-accepted', refresh);
    return () => {
      socket.off('friend-request', refresh);
      socket.off('friend-request-accepted', refresh);
    };
  }, [authLoading, user, refresh]);

  const incoming = pending.filter((p) => p.direction === 'incoming');
  const outgoing = pending.filter((p) => p.direction === 'outgoing');

  const handleRequest = async () => {
    const q = query.trim();
    if (!q) return;
    setRequesting(true);
    try {
      await friendsApi.request(q);
      addToast('Friend request sent', { variant: 'success' });
      setQuery('');
      setTab('pending');
      refresh();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      addToast(apiErr.response?.data?.error ?? 'Failed to send request', { variant: 'error' });
    } finally {
      setRequesting(false);
    }
  };

  const handleAccept = async (friendshipId: string) => {
    try {
      await friendsApi.accept(friendshipId);
      addToast('Friend added', { variant: 'success' });
      refresh();
    } catch {
      addToast('Failed to accept', { variant: 'error' });
    }
  };

  const handleReject = async (friendshipId: string) => {
    try {
      await friendsApi.reject(friendshipId);
      refresh();
    } catch {
      addToast('Failed to decline', { variant: 'error' });
    }
  };

  const handleRemove = async (friendshipId: string) => {
    try {
      await friendsApi.remove(friendshipId);
      addToast('Friend removed');
      refresh();
    } catch {
      addToast('Failed to remove', { variant: 'error' });
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'friends', label: 'Friends', badge: friends.length || undefined },
    { key: 'pending', label: 'Pending', badge: incoming.length || undefined },
    { key: 'add', label: 'Add' },
  ];

  return (
    <div className="min-h-dvh px-6 py-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold font-display">Friends</h1>
        <button
          onClick={() => router.push('/profile')}
          className="text-cream-dim text-sm hover:text-coral transition-colors"
        >
          Back
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
              tab === t.key ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1.5 text-xs">({t.badge})</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-cream-dim text-sm text-center py-8">Loading…</p>
      ) : tab === 'friends' ? (
        friends.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center">
            <p className="text-cream-dim text-sm">
              No friends yet. Use the Add tab to send a request.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((f) => (
              <div
                key={f.friendshipId}
                className="glass rounded-xl p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-coral/20 flex items-center justify-center text-coral font-semibold text-sm">
                    {f.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-cream font-medium">{f.displayName}</span>
                </div>
                <button
                  onClick={() => handleRemove(f.friendshipId)}
                  className="text-cream-dim text-xs hover:text-danger transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )
      ) : tab === 'pending' ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-cream-dim text-xs uppercase tracking-wide mb-2">
              Incoming
            </h2>
            {incoming.length === 0 ? (
              <p className="text-cream-dim text-sm">No incoming requests</p>
            ) : (
              <div className="space-y-2">
                {incoming.map((p) => (
                  <div
                    key={p.friendshipId}
                    className="glass rounded-xl p-3 flex items-center justify-between gap-2"
                  >
                    <span className="text-cream font-medium">{p.other.displayName}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(p.friendshipId)}
                        className="px-3 py-1.5 bg-coral text-charcoal text-xs font-semibold rounded-lg"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleReject(p.friendshipId)}
                        className="px-3 py-1.5 glass text-cream-dim text-xs rounded-lg hover:text-danger"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-cream-dim text-xs uppercase tracking-wide mb-2">
              Sent
            </h2>
            {outgoing.length === 0 ? (
              <p className="text-cream-dim text-sm">No outgoing requests</p>
            ) : (
              <div className="space-y-2">
                {outgoing.map((p) => (
                  <div
                    key={p.friendshipId}
                    className="glass rounded-xl p-3 flex items-center justify-between"
                  >
                    <span className="text-cream font-medium">{p.other.displayName}</span>
                    <button
                      onClick={() => handleReject(p.friendshipId)}
                      className="text-cream-dim text-xs hover:text-danger transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="glass rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold">Add a friend</h2>
          <p className="text-cream-dim text-xs">
            Enter their email or display name. They&apos;ll get a request to accept.
          </p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRequest();
            }}
            placeholder="email@example.com or DisplayName"
            className="w-full px-4 py-2.5 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-coral/60 border border-cream/10"
          />
          <button
            onClick={handleRequest}
            disabled={!query.trim() || requesting}
            className="w-full py-2.5 bg-coral text-charcoal rounded-xl font-medium hover:bg-coral-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {requesting ? 'Sending…' : 'Send request'}
          </button>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
