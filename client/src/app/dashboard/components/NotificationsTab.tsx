'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { friendsApi } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';

interface Invite {
  id: string;
  sessionId: string;
  shortCode: string | null;
  from: { id: string; username: string };
  createdAt: string;
  expiresAt: string;
}

interface NotificationsTabProps {
  addToast: (message: string) => void;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatExpiry(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export default function NotificationsTab({ addToast }: NotificationsTabProps) {
  const { user } = useAuth();
  const router = useRouter();

  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await friendsApi.invites();
      setInvites((res.data.invites ?? []) as Invite[]);
    } catch {
      addToast('Failed to load invites');
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
    socket.on('session-invite', refresh);
    return () => {
      socket.off('session-invite', refresh);
    };
  }, [user, refresh]);

  const accept = async (inv: Invite) => {
    setBusyId(inv.id);
    try {
      const res = await friendsApi.acceptInvite(inv.id);
      router.push(`/join/${res.data.sessionId}`);
    } catch {
      addToast('Invite expired or no longer valid');
      setInvites((prev) => prev.filter((i) => i.id !== inv.id));
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (inv: Invite) => {
    setBusyId(inv.id);
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
    try {
      await friendsApi.declineInvite(inv.id);
    } catch {
      addToast('Failed to decline');
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const sorted = useMemo(
    () => [...invites].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [invites],
  );

  if (user?.isGuest) {
    return (
      <div className="glass rounded-2xl p-6 text-center">
        <p className="text-cream-dim text-sm">
          Sign up to receive session invites from friends.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <h2 className="text-cream-dim text-xs uppercase tracking-wide mb-3">
        Session invites
      </h2>

      {loading ? (
        <p className="text-cream-dim text-sm text-center py-8">Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-cream-dim text-sm">
            No pending invites. Your friends will show up here when they start a group session.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((inv) => {
            const busy = busyId === inv.id;
            return (
              <div
                key={inv.id}
                className="glass rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-coral/20 flex items-center justify-center text-coral font-semibold text-sm shrink-0">
                    {inv.from.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-cream text-sm truncate">
                      <span className="font-semibold">{inv.from.username}</span>
                      <span className="text-cream-dim"> invited you to a group session</span>
                    </p>
                    <p className="text-cream-dim text-xs">
                      {formatRelative(inv.createdAt)} · {formatExpiry(inv.expiresAt)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => accept(inv)}
                    disabled={busy}
                    className="px-3 py-1.5 bg-coral text-charcoal text-xs font-semibold rounded-lg hover:bg-coral-dark transition-colors disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => decline(inv)}
                    disabled={busy}
                    className="px-3 py-1.5 glass text-cream-dim text-xs rounded-lg hover:text-danger transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
