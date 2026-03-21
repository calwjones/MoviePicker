'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { sessionApi, swipeApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { enqueueSwipe, flushQueue, hasQueuedSwipes } from '@/lib/swipeQueue';
import SwipeView from '@/components/SwipeView';
import MoviePoster from '@/components/MoviePoster';
import ToastContainer from '@/components/ToastContainer';
import { useToast } from '@/hooks/useToast';
import type { SessionMovie, Movie, StreamingProvider } from '@shared/types';

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
  const [online, setOnline] = useState(true);
  const [shortlist, setShortlist] = useState<SessionMovie[]>([]);
  const [winner, setWinner] = useState<SessionMovie | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchExhausted, setBatchExhausted] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOnline(navigator.onLine);
    const handleOnline = () => {
      setOnline(true);
      removeToast('reconnect');
      if (hasQueuedSwipes()) {
        flushQueue().then((res) => {
          if (res.flushed > 0) {
            addToast(`Synced ${res.flushed} swipe${res.flushed === 1 ? '' : 's'}`, { variant: 'success' });
          }
        });
      } else {
        addToast('Back online', { variant: 'success' });
      }
    };
    const handleOffline = () => {
      setOnline(false);
      addToast('Reconnecting…', { id: 'reconnect', variant: 'warn', duration: null });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addToast, removeToast]);

  useEffect(() => {
    if (!sessionId || !user || authLoading) return;
    sessionApi.get(sessionId).then((res) => {
      const { session } = res.data;
      const unswiped = session.movies.filter((m: SessionMovie) => m.user1Swipe === null);
      const rightSwiped = session.movies.filter((m: SessionMovie) => m.user1Swipe === 'right');
      for (let i = unswiped.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unswiped[i], unswiped[j]] = [unswiped[j], unswiped[i]];
      }
      setMovies(unswiped);
      setShortlist(rightSwiped);
      setCurrentIndex(0);
      if (unswiped.length === 0) setDone(true);
      setLoading(false);
    }).catch(() => router.push('/dashboard'));
  }, [sessionId, user, authLoading, router]);

  const handleSwipe = useCallback(async (direction: 'left' | 'right') => {
    if (currentIndex >= movies.length || swiping) return;
    const movie = movies[currentIndex];
    setSwiping(true);
    setSwipeError('');
    const advance = () => {
      setUndoStack((prev) => [...prev.slice(-9), { index: currentIndex, movieId: movie.movieId, direction }]);
      if (direction === 'right') {
        setShortlist((prev) => [...prev, movie]);
      }
      if (currentIndex + 1 >= movies.length) {
        setDone(true);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    };
    if (!online) {
      enqueueSwipe({ sessionId, movieId: movie.movieId, direction });
      advance();
      setSwiping(false);
      return;
    }
    try {
      await swipeApi.swipe(sessionId, movie.movieId, direction);
      advance();
    } catch {
      enqueueSwipe({ sessionId, movieId: movie.movieId, direction });
      advance();
    } finally {
      setSwiping(false);
    }
  }, [currentIndex, movies, sessionId, swiping, online]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    try {
      await swipeApi.undo(sessionId, last.movieId);
      setUndoStack((prev) => prev.slice(0, -1));
      if (last.direction === 'right') {
        setShortlist((prev) => prev.filter((m) => m.movieId !== last.movieId));
      }
      if (done) setDone(false);
      setCurrentIndex(last.index);
    } catch { /* swallow */ }
  }, [undoStack, done, sessionId]);

  const handleAnotherBatch = async () => {
    setBatchLoading(true);
    try {
      const res = await sessionApi.anotherBatch(sessionId);
      if (res.data.added === 0) {
        setBatchExhausted(true);
        addToast('No more movies match your filters', { variant: 'info' });
        return;
      }
      const newSession = res.data.session;
      const unswiped: SessionMovie[] = newSession.movies.filter((m: SessionMovie) => m.user1Swipe === null);
      for (let i = unswiped.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unswiped[i], unswiped[j]] = [unswiped[j], unswiped[i]];
      }
      setMovies(unswiped);
      setCurrentIndex(0);
      setUndoStack([]);
      setDone(false);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load more movies'), { variant: 'error' });
    } finally {
      setBatchLoading(false);
    }
  };

  const handlePickForTonight = () => {
    if (shortlist.length === 0) return;
    const pick = shortlist[Math.floor(Math.random() * shortlist.length)];
    setWinner(pick);
  };

  const handlePickAgain = () => {
    if (shortlist.length === 0) return;
    const eligible = shortlist.length > 1 && winner
      ? shortlist.filter((m) => m.movieId !== winner.movieId)
      : shortlist;
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    setWinner(pick);
  };

  const handleDoneExit = async () => {
    try { await swipeApi.done(sessionId); } catch { /* best-effort */ }
    router.push('/dashboard');
  };

  const doneContent = winner ? (
    <WinnerCard
      movie={winner.movie}
      canPickAgain={shortlist.length > 1}
      onPickAgain={handlePickAgain}
      onBack={() => setWinner(null)}
      onDone={handleDoneExit}
    />
  ) : shortlist.length === 0 ? (
    <EmptyShortlist
      onAnotherBatch={handleAnotherBatch}
      onDone={handleDoneExit}
      onUndo={handleUndo}
      undoCount={undoStack.length}
      batchLoading={batchLoading}
      batchExhausted={batchExhausted}
    />
  ) : (
    <ShortlistResults
      shortlist={shortlist}
      onPickForTonight={handlePickForTonight}
      onAnotherBatch={handleAnotherBatch}
      onDone={handleDoneExit}
      batchLoading={batchLoading}
      batchExhausted={batchExhausted}
    />
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
        doneContent={doneContent}
      />
      <ToastContainer toasts={toasts} />
    </>
  );
}

function ShortlistResults({
  shortlist,
  onPickForTonight,
  onAnotherBatch,
  onDone,
  batchLoading,
  batchExhausted,
}: {
  shortlist: SessionMovie[];
  onPickForTonight: () => void;
  onAnotherBatch: () => void;
  onDone: () => void;
  batchLoading: boolean;
  batchExhausted: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass rounded-2xl p-6 space-y-4 w-full max-w-md lg:max-w-lg text-left"
    >
      <div>
        <h2 className="text-lg font-semibold font-display">Your shortlist</h2>
        <p className="text-cream-dim text-xs mt-1">
          {shortlist.length} movie{shortlist.length === 1 ? '' : 's'} right-swiped
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {shortlist.map((sm) => (
          <div key={sm.id} className="space-y-2">
            <div className="aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-lg">
              <MoviePoster posterUrl={sm.movie.posterUrl} title={sm.movie.title} />
            </div>
            <p className="text-xs font-medium truncate text-cream">{sm.movie.title}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={onPickForTonight}
          className="w-full py-3 bg-coral text-charcoal font-semibold rounded-xl text-sm hover:bg-coral-dark transition-colors"
        >
          Pick one for tonight
        </button>
        {!batchExhausted && (
          <button
            onClick={onAnotherBatch}
            disabled={batchLoading}
            className="w-full py-2.5 glass rounded-xl text-cream-dim text-sm hover:text-cream transition-colors disabled:opacity-50"
          >
            {batchLoading ? 'Loading…' : 'Another batch'}
          </button>
        )}
        <button
          onClick={onDone}
          className="w-full py-2.5 text-cream-dim/70 text-xs hover:text-cream transition-colors"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}

function EmptyShortlist({
  onAnotherBatch,
  onDone,
  onUndo,
  undoCount,
  batchLoading,
  batchExhausted,
}: {
  onAnotherBatch: () => void;
  onDone: () => void;
  onUndo: () => void;
  undoCount: number;
  batchLoading: boolean;
  batchExhausted: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass rounded-2xl p-6 space-y-4 w-full max-w-sm text-left"
    >
      <div>
        <h2 className="text-lg font-semibold font-display">You skipped everything</h2>
        <p className="text-cream-dim text-xs mt-1">
          {batchExhausted
            ? 'No more movies match these filters.'
            : 'Try another batch, or adjust your filters from the dashboard.'}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {!batchExhausted && (
          <button
            onClick={onAnotherBatch}
            disabled={batchLoading}
            className="w-full py-3 bg-coral text-charcoal font-semibold rounded-xl text-sm hover:bg-coral-dark transition-colors disabled:opacity-50"
          >
            {batchLoading ? 'Loading…' : 'Another batch'}
          </button>
        )}
        {undoCount > 0 && (
          <button
            onClick={onUndo}
            className="w-full py-2.5 glass rounded-xl text-cream-dim text-sm hover:text-cream transition-colors"
          >
            Undo last swipe
          </button>
        )}
        <button
          onClick={onDone}
          className="w-full py-2.5 text-cream-dim/70 text-xs hover:text-cream transition-colors"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}

function WinnerCard({
  movie,
  canPickAgain,
  onPickAgain,
  onBack,
  onDone,
}: {
  movie: Movie;
  canPickAgain: boolean;
  onPickAgain: () => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const streaming = (movie.streamingProviders ?? []).filter((p: StreamingProvider) => p.type === 'stream');

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 15 }}
      className="w-full max-w-sm text-left"
    >
      <div className="glass rounded-3xl overflow-hidden">
        <div className="aspect-[2/3] relative">
          {movie.posterUrl ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${movie.posterUrl})` }}
            />
          ) : (
            <div className="absolute inset-0 bg-card flex items-center justify-center">
              <span className="text-cream-dim text-lg">{movie.title}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
          <div className="absolute top-4 left-4 px-3 py-1 bg-coral rounded-full">
            <span className="text-charcoal text-xs font-bold">TONIGHT&apos;S PICK</span>
          </div>
        </div>

        <div className="h-4 ticket-edge" />

        <div className="p-6">
          <h2 className="text-2xl font-bold mb-2 font-display">{movie.title}</h2>
          <div className="flex items-center gap-3 text-cream-dim text-sm mb-3">
            <span>{movie.year}</span>
            {movie.runtime && <span>{movie.runtime} min</span>}
            {movie.tmdbRating && <span className="text-danger">&#9733; {movie.tmdbRating.toFixed(1)}</span>}
          </div>
          {movie.director && (
            <p className="text-cream-dim text-sm mb-3">Directed by {movie.director}</p>
          )}
          {streaming.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {streaming.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 glass rounded-lg px-2 py-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded" />
                  <span className="text-xs text-cream-dim">{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {canPickAgain && (
          <button
            onClick={onPickAgain}
            className="w-full py-3 bg-coral text-charcoal font-semibold rounded-xl text-sm hover:bg-coral-dark transition-colors"
          >
            Pick again
          </button>
        )}
        <button
          onClick={onBack}
          className="w-full py-3 glass rounded-xl text-cream-dim text-sm hover:text-cream transition-colors"
        >
          Back to shortlist
        </button>
        <button
          onClick={onDone}
          className="w-full py-2.5 text-cream-dim/70 text-xs hover:text-cream transition-colors"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}
