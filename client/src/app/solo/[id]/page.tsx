'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { sessionApi, swipeApi } from '@/lib/api';
import SwipeView from '@/components/SwipeView';
import type { SessionMovie } from '@shared/types';

export default function SoloSessionPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuthGuard();
  const router = useRouter();
  const [movies, setMovies] = useState<SessionMovie[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState(false);
  const [swipeError, setSwipeError] = useState('');
  const [undoStack, setUndoStack] = useState<{ index: number; movieId: string; direction: string }[]>([]);

  useEffect(() => {
    if (!sessionId || !user || authLoading) return;
    sessionApi.get(sessionId).then((res) => {
      const { session } = res.data;
      const unswiped = session.movies.filter((m: SessionMovie) => m.user1Swipe === null);
      const swiped = session.movies.filter((m: SessionMovie) => m.user1Swipe !== null);
      for (let i = unswiped.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unswiped[i], unswiped[j]] = [unswiped[j], unswiped[i]];
      }
      setMovies(unswiped);
      setCurrentIndex(0);
      if (unswiped.length === 0 && swiped.length > 0) setDone(true);
      setLoading(false);
    }).catch(() => router.push('/dashboard'));
  }, [sessionId, user, authLoading, router]);

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
    } catch {
      // Don't reset state on API failure
    }
  }, [undoStack, done, sessionId]);

  const doneContent = (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
      <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'var(--font-playfair)' }}>
        Finished!
      </h2>
      <p className="text-cream-dim mb-2">Finding your matches...</p>
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
      doneContent={doneContent}
    />
  );
}
