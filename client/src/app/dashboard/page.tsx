'use client';

import { useCallback, useState, useEffect, useLayoutEffect, useRef, Suspense } from 'react';
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
import FeedbackButton from '@/components/FeedbackButton';
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
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [inviteCount, setInviteCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?mode=login');
    }
  }, [user, authLoading, router]);

  // The URL is the source of truth for the tab, so refresh, back/forward and
  // shared links all land where you were.
  const rawTab = searchParams.get('tab');
  const requestedTab = rawTab === 'browse' ? 'discover' : rawTab;
  const tab: Tab =
    requestedTab && ALL_TABS.includes(requestedTab as Tab) && !(requestedTab === 'friends' && user?.isGuest)
      ? (requestedTab as Tab)
      : 'discover';

  // Tabs stay mounted once visited, so switching back is instant and keeps
  // their state. (Setting state during render is React's pattern for this.)
  const [visited, setVisited] = useState<Tab[]>([tab]);
  if (!visited.includes(tab)) setVisited([...visited, tab]);

  // Once the first tab has settled, mount the rest in the background so their
  // first visit is already loaded too.
  useEffect(() => {
    if (authLoading || !user) return;
    const warm = () => setVisited(user.isGuest ? ALL_TABS.filter((t) => t !== 'friends') : [...ALL_TABS]);
    let idleId: number | undefined;
    // Head start so the visible tab's own requests go first.
    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(warm, { timeout: 2000 });
      else warm();
    }, 1200);
    return () => {
      clearTimeout(timer);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
    };
  }, [authLoading, user]);

  const scrollByTab = useRef<Partial<Record<Tab, number>>>({});
  const selectTab = useCallback((t: Tab) => {
    scrollByTab.current[tab] = window.scrollY;
    router.replace(t === 'discover' ? '/dashboard' : `/dashboard?tab=${t}`, { scroll: false });
  }, [router, tab]);

  // Each tab comes back where you left it (top of page on first visit).
  useLayoutEffect(() => {
    const y = scrollByTab.current[tab];
    if (y !== undefined) window.scrollTo(0, y);
    else if (window.scrollY > 0) window.scrollTo(0, 0);
  }, [tab]);

  useEffect(() => {
    if (rawTab === 'notifications' && user && !user.isGuest) setBellOpen(true);
  }, [rawTab, user]);

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
    else selectTab('swipe');
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
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-coral text-cream text-[10px] font-bold flex items-center justify-center">
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
            onClick={() => selectTab(t)}
            aria-current={tab === t ? 'page' : undefined}
            className={`relative shrink-0 py-2 px-4 sm:flex-1 sm:px-2 rounded-xl text-sm font-medium transition-colors duration-200 glass ${
              tab === t ? 'text-cream' : 'text-cream-dim hover:text-cream'
            }`}
          >
            {tab === t && (
              <motion.span
                layoutId="dashboard-tab-pill"
                className="absolute inset-0 rounded-xl bg-coral"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative">{TAB_LABELS[t]}</span>
          </button>
        ))}
      </div>

      {tabs.filter((t) => visited.includes(t)).map((t) => (
        <section key={t} hidden={t !== tab} aria-label={TAB_LABELS[t]} className="tab-panel">
          {t === 'discover' && <DiscoverTab addToast={addToast} />}
          {t === 'library' && <LibraryTab addToast={addToast} active={tab === 'library'} />}
          {t === 'swipe' && <SwipeTab addToast={addToast} active={tab === 'swipe'} />}
          {t === 'friends' && <FriendsTab addToast={addToast} active={tab === 'friends'} />}
          {t === 'history' && <HistoryTab addToast={addToast} active={tab === 'history'} />}
        </section>
      ))}

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
      {user && !user.isGuest && <FeedbackButton addToast={addToast} />}
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
