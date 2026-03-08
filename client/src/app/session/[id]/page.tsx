'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { sessionApi, swipeApi } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import SwipeView from '@/components/SwipeView';
import ToastContainer from '@/components/ToastContainer';
import { useToast } from '@/hooks/useToast';
import type { SessionMovie } from '@shared/types';

export default function SessionPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuthGuard();
  const router = useRouter();
  const [movies, setMovies] = useState<SessionMovie[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [partnerProgress, setPartnerProgress] = useState(0);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState(false);
  const [swipeError, setSwipeError] = useState('');
  const [undoStack, setUndoStack] = useState<{ index: number; movieId: string; direction: string }[]>([]);
  const { toasts, addToast, removeToast } = useToast();
  const hasConnectedRef = useRef(false);
  const wasPartnerOnlineRef = useRef(false);

  useEffect(() => {
    if (!sessionId || !user || authLoading) return;
    sessionApi.get(sessionId).then((res) => {
      const { session, isUser1: iu1 } = res.data;
      const swipeField = iu1 ? 'user1Swipe' : 'user2Swipe';
      const unswiped = session.movies.filter((m: SessionMovie) => m[swipeField] === null);
      const swiped = session.movies.filter((m: SessionMovie) => m[swipeField] !== null);
      for (let i = unswiped.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unswiped[i], unswiped[j]] = [unswiped[j], unswiped[i]];
      }
      setMovies(unswiped);
      setCurrentIndex(0);
      const otherField = iu1 ? 'user2Swipe' : 'user1Swipe';
      const partnerSwiped = session.movies.filter((m: SessionMovie) => m[otherField] !== null).length;
      const total = session.movies.length;
      setPartnerProgress(total > 0 ? Math.round((partnerSwiped / total) * 100) : 0);
      if (unswiped.length === 0 && swiped.length > 0) setDone(true);
      setLoading(false);
    }).catch(() => router.push('/dashboard'));
  }, [sessionId, user, authLoading, router]);

  useEffect(() => {
    if (!sessionId) return;
    connectSocket();
    const socket = getSocket();
    socket.emit('join-session', sessionId);

    const handleSwipeUpdate = (data: { progress: number }) => {
      if (data.progress !== undefined) setPartnerProgress(data.progress);
    };
    const handleSessionComplete = () => router.replace(`/matches/${sessionId}`);
    const handlePartnerDone = () => {
      setPartnerProgress(100);
      addToast('Partner finished swiping', { variant: 'info' });
    };
    const handlePartnerOnline = () => {
      setPartnerOnline(true);
      if (wasPartnerOnlineRef.current) {
        addToast('Partner back online', { variant: 'success' });
      } else {
        addToast('Partner connected', { variant: 'success' });
        wasPartnerOnlineRef.current = true;
      }
    };
    const handleDisconnect = () => {
      setPartnerOnline(false);
      addToast('Reconnecting…', { id: 'reconnect', variant: 'warn', duration: null });
    };
    const handleConnect = () => {
      socket.emit('join-session', sessionId);
      if (hasConnectedRef.current) {
        removeToast('reconnect');
        addToast('Back online', { variant: 'success' });
      } else {
        hasConnectedRef.current = true;
      }
    };

    socket.on('swipe-update', handleSwipeUpdate);
    socket.on('session-complete', handleSessionComplete);
    socket.on('partner-done', handlePartnerDone);
    socket.on('partner-online', handlePartnerOnline);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleConnect);
    if (socket.connected) hasConnectedRef.current = true;

    return () => {
      socket.off('swipe-update', handleSwipeUpdate);
      socket.off('session-complete', handleSessionComplete);
      socket.off('partner-done', handlePartnerDone);
      socket.off('partner-online', handlePartnerOnline);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleConnect);
    };
  }, [sessionId, router, addToast, removeToast]);

  const handleSwipe = useCallback(async (direction: 'left' | 'right') => {
    if (currentIndex >= movies.length || swiping) return;
    const movie = movies[currentIndex];
    setSwiping(true);
    setSwipeError('');
    try {
      await swipeApi.swipe(sessionId, movie.movieId, direction);
      setUndoStack((prev) => [...prev.slice(-9), { index: currentIndex, movieId: movie.movieId, direction }]);
      if (currentIndex + 1 >= movies.length) {
        setDone(true);
        const res = await swipeApi.done(sessionId);
        if (res.data.status === 'completed') router.replace(`/matches/${sessionId}`);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    } catch {
      setSwipeError('Swipe failed — tap to retry');
    } finally {
      setSwiping(false);
    }
  }, [currentIndex, movies, sessionId, router, swiping]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    try {
      await swipeApi.undo(sessionId, last.movieId);
      setUndoStack((prev) => prev.slice(0, -1));
      if (done) setDone(false);
      setCurrentIndex(last.index);
    } catch {}
  }, [undoStack, done, sessionId]);

  const doneContent = (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
      <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'var(--font-playfair)' }}>
        All done!
      </h2>
      <p className="text-cream-dim mb-2">Waiting for your partner to finish swiping...</p>
      <div className="w-48 h-2 bg-card rounded-full mx-auto mt-4 overflow-hidden">
        <motion.div
          className="h-full bg-coral rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(partnerProgress, 100)}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <p className="text-cream-dim text-sm mt-2">Partner: {Math.min(partnerProgress, 100)}%</p>
      {undoStack.length > 0 && (
        <button
          onClick={handleUndo}
          className="mt-4 py-2 px-6 glass rounded-xl text-cream-dim text-sm hover:bg-card-hover transition-colors"
        >
          Undo last swipe
        </button>
      )}
    </motion.div>
  );

  return (
    <>
      <SwipeView
        movies={movies}
        currentIndex={currentIndex}
        onSwipe={handleSwipe}
        onUndo={handleUndo}
        undoStack={undoStack}
        swiping={swiping}
        swipeError={swipeError}
        loading={loading}
        done={done}
        headerRight={
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${partnerOnline ? 'bg-success animate-pulse' : 'bg-cream-dim'}`} />
            <span className="text-cream-dim text-xs">Partner: {Math.min(partnerProgress, 100)}%</span>
          </div>
        }
        doneContent={doneContent}
      />
      <ToastContainer toasts={toasts} />
    </>
  );
}
