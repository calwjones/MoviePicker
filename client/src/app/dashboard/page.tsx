'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ToastContainer';
import BrowseTab from './components/BrowseTab';
import LibraryTab from './components/LibraryTab';
import SwipeTab from './components/SwipeTab';
import FriendsTab from './components/FriendsTab';
import HistoryTab from './components/HistoryTab';
import OnboardingModal from '@/components/OnboardingModal';

type Tab = 'browse' | 'library' | 'swipe' | 'friends' | 'history';
const ALL_TABS: readonly Tab[] = ['browse', 'library', 'swipe', 'friends', 'history'];

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toasts, addToast } = useToast();
  const [tab, setTab] = useState<Tab>('browse');
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?mode=login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && ALL_TABS.includes(t as Tab)) {
      if (t === 'friends' && user?.isGuest) return;
      setTab(t as Tab);
    }
  }, [searchParams, user]);

  useEffect(() => {
    if (authLoading || !user || user.isGuest) return;
    try {
      const seen = localStorage.getItem('moviepicker_onboarded');
      if (!seen) setOnboardingOpen(true);
    } catch { /* ignore */ }
  }, [user, authLoading]);

  const dismissOnboarding = () => {
    setOnboardingOpen(false);
    try { localStorage.setItem('moviepicker_onboarded', '1'); } catch {}
  };

  const handleOnboardingPath = (path: 'together' | 'solo' | 'discover') => {
    dismissOnboarding();
    if (path === 'discover') router.push('/discover');
    else setTab('swipe');
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: Tab[] = user?.isGuest
    ? ['browse', 'library', 'swipe', 'history']
    : ['browse', 'library', 'swipe', 'friends', 'history'];

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
              @{user.username}
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

      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'browse' && <BrowseTab key="browse" addToast={addToast} />}
        {tab === 'library' && <LibraryTab key="library" addToast={addToast} />}
        {tab === 'swipe' && <SwipeTab key="swipe" addToast={addToast} />}
        {tab === 'friends' && <FriendsTab key="friends" addToast={addToast} />}
        {tab === 'history' && <HistoryTab key="history" addToast={addToast} />}
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
