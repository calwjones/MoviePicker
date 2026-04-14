'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { connectSocket, getSocket } from '@/lib/socket';
import { friendsApi } from '@/lib/api';

interface SessionInvite {
  inviteId: string;
  sessionId: string;
  hostName: string;
}

interface FriendToast {
  id: number;
  message: string;
}

export default function GlobalInviteListener() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [invite, setInvite] = useState<SessionInvite | null>(null);
  const [toasts, setToasts] = useState<FriendToast[]>([]);

  useEffect(() => {
    if (loading || !user || user.isGuest) return;
    connectSocket();
    const socket = getSocket();
    const onInvite = (data: SessionInvite) => setInvite(data);
    const pushToast = (message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
    };
    const onFriendRequest = (data: { from?: { username?: string } }) => {
      pushToast(`@${data?.from?.username ?? 'someone'} sent you a friend request`);
    };
    const onFriendAccepted = () => {
      pushToast('Friend request accepted');
    };
    socket.on('session-invite', onInvite);
    socket.on('friend-request', onFriendRequest);
    socket.on('friend-request-accepted', onFriendAccepted);
    return () => {
      socket.off('session-invite', onInvite);
      socket.off('friend-request', onFriendRequest);
      socket.off('friend-request-accepted', onFriendAccepted);
    };
  }, [user, loading]);

  const accept = async () => {
    if (!invite) return;
    try {
      const res = await friendsApi.acceptInvite(invite.inviteId);
      router.push(`/join/${res.data.sessionId}`);
    } catch { /* ignore */ }
    setInvite(null);
  };

  const decline = async () => {
    if (!invite) return;
    try { await friendsApi.declineInvite(invite.inviteId); } catch { /* ignore */ }
    setInvite(null);
  };

  return (
    <>
      <AnimatePresence>
        {invite && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] glass rounded-2xl p-4 border border-coral/40 shadow-xl max-w-sm w-[calc(100%-2rem)]"
          >
            <p className="text-cream text-sm mb-3">
              <span className="font-semibold">{invite.hostName}</span> invited you to a swipe session
            </p>
            <div className="flex gap-2">
              <button
                onClick={accept}
                className="flex-1 py-2 bg-coral text-charcoal font-semibold rounded-lg text-sm"
              >
                Accept
              </button>
              <button
                onClick={decline}
                className="px-4 py-2 glass text-cream-dim hover:text-danger rounded-lg text-sm"
              >
                Decline
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="glass rounded-xl px-4 py-2 text-sm text-cream shadow-lg border border-cream/20 pointer-events-auto cursor-pointer"
              onClick={() => router.push('/dashboard?tab=friends')}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
