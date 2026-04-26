'use client';

import { useCallback, useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { friendsApi } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import ToastContainer from '@/components/ToastContainer';
import DiscoverTab from './components/DiscoverTab';
import LibraryTab from './components/LibraryTab';
import SwipeTab from './components/SwipeTab';
import FriendsTab from './components/FriendsTab';
import HistoryTab from './components/HistoryTab';
import NotificationsTab from './components/NotificationsTab';
import OnboardingModal from '@/components/OnboardingModal';
import { FullPageSpinner } from '@/components/LoadingSpinner';

type Tab = 'discover' | 'library' | 'swipe' | 'friends' | 'history';
const ALL_TABS: readonly Tab[] = ['discover', 'library', 'swipe', 'friends', 'history'];

const TAB_LABELS: Record<Tab, string> = {
  discover: 'Discover',
  library: 'Library',
  swipe: 'Swipe',
  friends: 'Friends',
  history: 'History',
};

function DashboardContent() {
  const { user, loading: authLoading, logout, completeOnboarding } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toasts, addToast } = useToast();
  const [tab, setTab] = useState<Tab>('discover');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [inviteCount, setInviteCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?mode=login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const raw = searchParams.get('tab');
    if (raw === 'notifications') {
      if (!user?.isGuest) setBellOpen(true);
      return;
    }
    const t = raw === 'browse' ? 'discover' : raw;
    if (t && ALL_TABS.includes(t as Tab)) {
      if (t === 'friends' && user?.isGuest) return;
      setTab(t as Tab);
    }
  }, [searchParams, user]);

  const refreshInvites = useCallback(async () => {
    try {
      const res = await friendsApi.invites();
      setInviteCount((res.data.invites ?? []).length);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user || user.isGuest) return;
    refreshInvites();
    connectSocket();
    const socket = getSocket();
    socket.on('session-invite', refreshInvites);
    return () => {
      socket.off('session-invite', refreshInvites);
    };
  }, [user, authLoading, refreshInvites]);

  useEffect(() => {
    if (bellOpen) refreshInvites();
  }, [bellOpen, refreshInvites]);

  useEffect(() => {
    if (authLoading || !user || user.isGuest) return;
    if (!user.onboardedAt) setOnboardingOpen(true);
  }, [user, authLoading]);

  const dismissOnboarding = () => {
    setOnboardingOpen(false);
    completeOnboarding().catch((err) => console.warn('[onboarding] mark complete failed', err));
  };

  const handleOnboardingPath = (path: 'together' | 'solo' | 'discover') => {
    dismissOnboarding();
    if (path === 'discover') router.push('/discover');
    else setTab('swipe');
  };

  if (authLoading) {
    return <FullPageSpinner />;
  }

  const tabs: Tab[] = user?.isGuest
    ? ['discover', 'library', 'swipe', 'history']
    : ['discover', 'library', 'swipe', 'friends', 'history'];

  return (
    <div className="min-h-dvh px-6 py-8 w-full max-w-5xl mx-auto lg:px-12 flex flex-col items-stretch">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold font-display">
          Match<span className="text-coral">Sticked</span>
        </h1>
        <div className="flex items-center gap-3">
          {user && !user.isGuest && (
            <button
              onClick={() => setBellOpen(true)}
              className="relative text-cream-dim hover:text-coral transition-colors p-1"
              aria-label={`Notifications${inviteCount > 0 ? `, ${inviteCount} unread` : ''}`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {inviteCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-coral text-charcoal text-[10px] font-bold flex items-center justify-center">
                  {inviteCount}
                </span>
              )}
            </button>
          )}
          {user && !user.isGuest && (
            <button
              onClick={() => router.push('/profile')}
              className="text-cream-dim text-sm hover:text-coral transition-colors"
            >
              {user.username}
            </button>
          )}
          {user?.isGuest && (
            <span className="text-cream-dim text-sm">{user.username}</span>
          )}
          <button
            onClick={logout}
            className="text-cream-dim text-sm hover:text-danger transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto -mx-1 px-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 py-2 px-4 sm:flex-1 sm:px-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'discover' && <DiscoverTab key="discover" addToast={addToast} />}
        {tab === 'library' && <LibraryTab key="library" addToast={addToast} />}
        {tab === 'swipe' && <SwipeTab key="swipe" addToast={addToast} />}
        {tab === 'friends' && <FriendsTab key="friends" addToast={addToast} />}
        {tab === 'history' && <HistoryTab key="history" addToast={addToast} />}
      </AnimatePresence>

      <AnimatePresence>
        {bellOpen && (
          <>
            <motion.div
              key="bell-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-40"
              onClick={() => setBellOpen(false)}
            />
            <motion.div
              key="bell-panel"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 max-h-[80dvh] overflow-y-auto z-50 bg-card glass rounded-2xl p-4 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold font-display">Notifications</h2>
                <button
                  onClick={() => setBellOpen(false)}
                  className="text-cream-dim hover:text-cream transition-colors"
                  aria-label="Close notifications"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <NotificationsTab addToast={addToast} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} />
      <OnboardingModal
        open={onboardingOpen}
        onClose={dismissOnboarding}
        onPickPath={handleOnboardingPath}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <DashboardContent />
    </Suspense>
  );
}
