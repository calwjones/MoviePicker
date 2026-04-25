'use client';

import { useCallback, useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
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

type Tab = 'discover' | 'library' | 'swipe' | 'friends' | 'history' | 'notifications';
const ALL_TABS: readonly Tab[] = ['discover', 'library', 'swipe', 'friends', 'history', 'notifications'];

const TAB_LABELS: Record<Tab, string> = {
  discover: 'Discover',
  library: 'Library',
  swipe: 'Swipe',
  friends: 'Friends',
  history: 'History',
  notifications: 'Alerts',
};

function DashboardContent() {
  const { user, loading: authLoading, logout, completeOnboarding } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toasts, addToast } = useToast();
  const [tab, setTab] = useState<Tab>('discover');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [inviteCount, setInviteCount] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?mode=login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const raw = searchParams.get('tab');
    const t = raw === 'browse' ? 'discover' : raw;
    if (t && ALL_TABS.includes(t as Tab)) {
      if ((t === 'friends' || t === 'notifications') && user?.isGuest) return;
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
    if (tab === 'notifications') refreshInvites();
  }, [tab, refreshInvites]);

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
    : ['discover', 'library', 'swipe', 'friends', 'history', 'notifications'];

  return (
    <div className="min-h-dvh px-6 py-8 w-full max-w-5xl mx-auto lg:px-12 flex flex-col items-stretch">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold font-display">
          Match<span className="text-coral">Sticked</span>
        </h1>
        <div className="flex items-center gap-3">
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
        {tabs.map((t) => {
          const showBadge = t === 'notifications' && inviteCount > 0;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 py-2 px-4 sm:flex-1 sm:px-2 rounded-xl text-sm font-medium transition-colors relative ${
                tab === t ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
              }`}
            >
              {TAB_LABELS[t]}
              {showBadge && (
                <span
                  className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                    tab === t ? 'bg-charcoal text-coral' : 'bg-coral text-charcoal'
                  }`}
                >
                  {inviteCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'discover' && <DiscoverTab key="discover" addToast={addToast} />}
        {tab === 'library' && <LibraryTab key="library" addToast={addToast} />}
        {tab === 'swipe' && <SwipeTab key="swipe" addToast={addToast} />}
        {tab === 'friends' && <FriendsTab key="friends" addToast={addToast} />}
        {tab === 'history' && <HistoryTab key="history" addToast={addToast} />}
        {tab === 'notifications' && <NotificationsTab key="notifications" addToast={addToast} />}
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
