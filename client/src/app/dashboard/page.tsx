'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { coupleApi } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ToastContainer';
import CoupleSetup from './components/CoupleSetup';
import LibraryTab from './components/LibraryTab';
import ImportTab from './components/ImportTab';
import SwipeTab from './components/SwipeTab';
import HistoryTab from './components/HistoryTab';
import type { Couple } from '@shared/types';

type Tab = 'library' | 'import' | 'swipe' | 'history';

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const { toasts, addToast } = useToast();
  const [couple, setCouple] = useState<Couple | null>(null);
  const [coupleLoaded, setCoupleLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('library');

  const isPaired = !!couple?.user2;
  const availableTabs: Tab[] = ['library', 'import', 'swipe', 'history'];

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?mode=login');
      return;
    }
    if (user) {
      coupleApi.me()
        .then((res) => {
          setCouple(res.data.couple);
          setCoupleLoaded(true);
        })
        .catch(() => {
          setCoupleLoaded(true);
        });
    }
  }, [user, authLoading, router]);

  // Socket: waiting for partner to join
  useEffect(() => {
    if (!couple?.id || couple.user2) return;
    connectSocket();
    const socket = getSocket();
    socket.emit('join-couple', couple.id);
    socket.on('partner-joined', (data: { couple: Couple }) => {
      setCouple(data.couple);
    });
    return () => { socket.off('partner-joined'); };
  }, [couple?.id, couple?.user2]);

  // Socket: partner left or partner started a session
  useEffect(() => {
    if (!couple?.id || !couple.user2) return;
    connectSocket();
    const socket = getSocket();
    socket.emit('join-couple', couple.id);
    socket.on('partner-left', () => {
      coupleApi.me()
        .then((res) => setCouple(res.data.couple))
        .catch(() => setCouple(null));
    });
    socket.on('session-created', (data: { sessionId: string; createdBy?: string }) => {
      if (data.createdBy !== user?.id) {
        router.push(`/session/${data.sessionId}`);
      }
    });
    return () => {
      socket.off('partner-left');
      socket.off('session-created');
    };
  }, [couple?.id, couple?.user2, router, user?.id]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-6 py-8 w-full max-w-5xl mx-auto lg:px-12 flex flex-col items-stretch">
      {/* Header */}
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

      {coupleLoaded && (
        <CoupleSetup
          couple={couple}
          onCoupleChange={setCouple}
          addToast={addToast}
        />
      )}

      {/* Tabs */}
      {coupleLoaded && (
        <div className="flex gap-2 mb-6">
          {availableTabs.map((t) => (
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
      )}

      <AnimatePresence mode="wait">
        {tab === 'library' && (
          <LibraryTab key="library" couple={couple} addToast={addToast} />
        )}
        {tab === 'import' && (
          <ImportTab
            key="import"
            onImportComplete={() => setTab('library')}
          />
        )}
        {tab === 'swipe' && (
          <SwipeTab key="swipe" addToast={addToast} isPaired={isPaired} />
        )}
        {tab === 'history' && (
          <HistoryTab key="history" addToast={addToast} />
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
