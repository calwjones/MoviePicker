'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ToastContainer';
import LibraryTab from './components/LibraryTab';
import ImportTab from './components/ImportTab';
import SwipeTab from './components/SwipeTab';
import HistoryTab from './components/HistoryTab';

type Tab = 'library' | 'import' | 'swipe' | 'history';

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const { toasts, addToast } = useToast();
  const [tab, setTab] = useState<Tab>('library');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?mode=login');
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: Tab[] = ['library', 'import', 'swipe', 'history'];

  return (
    <div className="min-h-dvh px-6 py-8 w-full max-w-5xl mx-auto lg:px-12 flex flex-col items-stretch">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold font-display">
          Movie<span className="text-danger">Picker</span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-cream-dim text-sm">{user?.displayName}</span>
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
        {tab === 'library' && <LibraryTab key="library" addToast={addToast} />}
        {tab === 'import' && (
          <ImportTab key="import" onImportComplete={() => setTab('library')} />
        )}
        {tab === 'swipe' && <SwipeTab key="swipe" addToast={addToast} />}
        {tab === 'history' && <HistoryTab key="history" addToast={addToast} />}
      </AnimatePresence>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
