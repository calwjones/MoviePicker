'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { friendsApi } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import FriendLibraryPanel from './FriendLibraryPanel';

type Friend = {
  id: string;
  username: string;
  avatarUrl: string | null;
  friendshipId: string;
};

type Pending = {
  friendshipId: string;
  direction: 'incoming' | 'outgoing';
  other: { id: string; username: string; avatarUrl: string | null };
  createdAt: string;
};

type SubTab = 'friends' | 'pending' | 'add';

interface FriendsTabProps {
  addToast: (message: string) => void;
}

export default function FriendsTab({ addToast }: FriendsTabProps) {
  const { user } = useAuth();

  const [subTab, setSubTab] = useState<SubTab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [requesting, setRequesting] = useState(false);

  const [openFriend, setOpenFriend] = useState<Friend | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [friendsRes, pendingRes] = await Promise.all([
        friendsApi.list(),
        friendsApi.pending(),
      ]);
      setFriends(friendsRes.data.friends ?? []);
      setPending(pendingRes.data.pending ?? []);
    } catch {
      addToast('Failed to load friends');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!user || user.isGuest) return;
    refresh();
  }, [user, refresh]);

  useEffect(() => {
    if (!user || user.isGuest) return;
    connectSocket();
    const socket = getSocket();
    socket.on('friend-request', refresh);
    socket.on('friend-request-accepted', refresh);
    return () => {
      socket.off('friend-request', refresh);
      socket.off('friend-request-accepted', refresh);
    };
  }, [user, refresh]);

  const incoming = pending.filter((p) => p.direction === 'incoming');
  const outgoing = pending.filter((p) => p.direction === 'outgoing');

  const handleRequest = async () => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    setRequesting(true);
    try {
      await friendsApi.request(q);
      addToast('Friend request sent');
      setQuery('');
      setSubTab('pending');
      refresh();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      addToast(apiErr.response?.data?.error ?? 'Failed to send request');
    } finally {
      setRequesting(false);
    }
  };

  const handleAccept = async (friendshipId: string) => {
    try {
      await friendsApi.accept(friendshipId);
      addToast('Friend added');
      refresh();
    } catch {
      addToast('Failed to accept');
    }
  };

  const handleReject = async (friendshipId: string) => {
    try {
      await friendsApi.reject(friendshipId);
      refresh();
    } catch {
      addToast('Failed to decline');
    }
  };

  const handleRemove = async (friendshipId: string) => {
    try {
      await friendsApi.remove(friendshipId);
      addToast('Friend removed');
      refresh();
    } catch {
      addToast('Failed to remove');
    }
  };

  const subTabs: { key: SubTab; label: string; badge?: number }[] = [
    { key: 'friends', label: 'Friends', badge: friends.length || undefined },
    { key: 'pending', label: 'Pending', badge: incoming.length || undefined },
    { key: 'add', label: 'Add' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <div className="flex gap-2 mb-6">
        {subTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
              subTab === t.key ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
            }`}
          >
            {t.label}
            {t.badge ? <span className="ml-1.5 text-xs">({t.badge})</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-cream-dim text-sm text-center py-8">Loading…</p>
      ) : subTab === 'friends' ? (
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
                className="glass rounded-xl p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-coral/20 flex items-center justify-center text-coral font-semibold text-sm shrink-0">
                    {f.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-cream font-medium truncate">{f.username}</span>
                </div>
                <div className="flex gap-2 items-center shrink-0">
                  <button
                    onClick={() => setOpenFriend(f)}
                    className="text-coral text-xs hover:text-coral-dark transition-colors"
                  >
                    View library
                  </button>
                  <button
                    onClick={() => handleRemove(f.friendshipId)}
                    className="text-cream-dim text-xs hover:text-danger transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : subTab === 'pending' ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-cream-dim text-xs uppercase tracking-wide mb-2">Incoming</h2>
            {incoming.length === 0 ? (
              <p className="text-cream-dim text-sm">No incoming requests</p>
            ) : (
              <div className="space-y-2">
                {incoming.map((p) => (
                  <div
                    key={p.friendshipId}
                    className="glass rounded-xl p-3 flex items-center justify-between gap-2"
                  >
                    <span className="text-cream font-medium">{p.other.username}</span>
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
            <h2 className="text-cream-dim text-xs uppercase tracking-wide mb-2">Sent</h2>
            {outgoing.length === 0 ? (
              <p className="text-cream-dim text-sm">No outgoing requests</p>
            ) : (
              <div className="space-y-2">
                {outgoing.map((p) => (
                  <div
                    key={p.friendshipId}
                    className="glass rounded-xl p-3 flex items-center justify-between"
                  >
                    <span className="text-cream font-medium">{p.other.username}</span>
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
            Enter their username. They&apos;ll get a request to accept.
          </p>
          <div className="flex items-center glass rounded-xl pl-3 pr-1 border border-cream/10">
            <span className="text-cream-dim text-sm">@</span>
            <input
              type="text"
              value={query}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value.replace(/\s/g, '').toLowerCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRequest(); }}
              placeholder="username"
              className="flex-1 bg-transparent py-2.5 px-2 text-cream placeholder:text-cream-dim/50 focus:outline-none"
            />
          </div>
          <button
            onClick={handleRequest}
            disabled={!query.trim() || requesting}
            className="w-full py-2.5 bg-coral text-charcoal rounded-xl font-medium hover:bg-coral-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {requesting ? 'Sending…' : 'Send request'}
          </button>
        </div>
      )}

      {openFriend && (
        <FriendLibraryPanel
          friend={openFriend}
          onClose={() => setOpenFriend(null)}
          addToast={addToast}
        />
      )}
    </motion.div>
  );
}
