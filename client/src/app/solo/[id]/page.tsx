'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { sessionApi, swipeApi, movieApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { enqueueSwipe, flushQueue, hasQueuedSwipes } from '@/lib/swipeQueue';
import { clearSwipeFilters } from '@/lib/filters';
import SwipeView from '@/components/SwipeView';
import InCinemaBadge from '@/components/InCinemaBadge';
import ToastContainer from '@/components/ToastContainer';
import ClientRouletteWheel from '@/components/ClientRouletteWheel';
import MatchesRevealView from '@/components/MatchesRevealView';
import StreamingProvidersList from '@/components/StreamingProviders';
import { useToast } from '@/hooks/useToast';
import type { SessionMovie, Movie } from '@matchsticked/shared';

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
  const [revealed, setRevealed] = useState(false);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [previousPickIds, setPreviousPickIds] = useState<string[]>([]);
  const [spinsLeft, setSpinsLeft] = useState(3);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
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

  useEffect(() => {
    return () => {
      revealTimers.current.forEach(clearTimeout);
      revealTimers.current = [];
    };
  }, []);

  const startReveal = useCallback(() => {
    revealTimers.current.forEach(clearTimeout);
    setRevealed(true);
    setRevealIndex(-1);
    revealTimers.current = shortlist.map((_, i) =>
      setTimeout(() => setRevealIndex(i), (i + 1) * 350),
    );
  }, [shortlist]);

  const revealAll = useCallback(() => {
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = [];
    setRevealIndex(shortlist.length - 1);
  }, [shortlist.length]);

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
      setWinner(null);
      setRouletteOpen(false);
      setRevealed(false);
      setRevealIndex(-1);
      setPreviousPickIds([]);
      setSpinsLeft(3);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load more movies'), { variant: 'error' });
    } finally {
      setBatchLoading(false);
    }
  };

  const handlePickForToday = () => {
    const remaining = shortlist.filter((sm) => !previousPickIds.includes(sm.id));
    if (remaining.length === 0) return;
    if (remaining.length === 1) {
      setWinner(remaining[0]);
      return;
    }
    setRouletteOpen(true);
  };

  const handleRouletteResult = (pick: SessionMovie) => {
    setWinner(pick);
  };

  const handlePickAgain = () => {
    if (!winner) return;
    const nextExcluded = [...previousPickIds, winner.id];
    setPreviousPickIds(nextExcluded);
    setWinner(null);
    const remaining = shortlist.filter((sm) => !nextExcluded.includes(sm.id));
    if (remaining.length === 1) {
      setWinner(remaining[0]);
      return;
    }
    if (remaining.length >= 2) setRouletteOpen(true);
  };

  const handleBackToShortlist = () => {
    setWinner(null);
    setRouletteOpen(false);
    setPreviousPickIds([]);
    setSpinsLeft(3);
  };

  const handleDoneExit = async () => {
    try { await swipeApi.done(sessionId); } catch { /* best-effort */ }
    clearSwipeFilters();
    router.push('/dashboard');
  };

  const rouletteMovies = shortlist.filter((sm) => !previousPickIds.includes(sm.id));
  const canPickAgain = shortlist.length - previousPickIds.length > 1;

  const doneContent = winner ? (
    <WinnerCard
      movie={winner.movie}
      canPickAgain={canPickAgain}
      onPickAgain={handlePickAgain}
      onBack={handleBackToShortlist}
      onDone={handleDoneExit}
    />
  ) : rouletteOpen && rouletteMovies.length >= 2 ? (
    <RouletteStage
      shortlist={rouletteMovies}
      onResult={handleRouletteResult}
      onBack={handleBackToShortlist}
      spinsLeft={spinsLeft}
      onSpinsLeftChange={setSpinsLeft}
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
    <MatchesRevealView
      items={shortlist.map((sm) => ({ id: sm.id, movie: sm.movie }))}
      title="Swiping complete!"
      counterLine={`You have ${shortlist.length} pick${shortlist.length === 1 ? '' : 's'}`}
      revealCTA={shortlist.length === 1 ? 'Reveal Your Pick' : 'Reveal Picks'}
      revealed={revealed}
      revealIndex={revealIndex}
      onStartReveal={startReveal}
      onRevealAll={revealAll}
      postRevealTitle="Your Shortlist"
      onToggleWatched={async (item, nextWatched) => {
        try {
          await movieApi.markWatched(item.movie.id, nextWatched);
          addToast(
            nextWatched
              ? `"${item.movie.title}" moved to Watched`
              : `"${item.movie.title}" back on your watchlist`,
            { variant: 'success' },
          );
          return true;
        } catch {
          addToast('Failed to update', { variant: 'error' });
          return false;
        }
      }}
      actions={
        <>
          <button
            onClick={handlePickForToday}
            className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors"
          >
            {shortlist.length >= 2 ? 'Spin the Roulette' : 'Pick one for today'}
          </button>
          {!batchExhausted && (
            <button
              onClick={handleAnotherBatch}
              disabled={batchLoading}
              className="w-full py-3 glass rounded-xl text-cream-dim font-medium hover:text-cream transition-colors disabled:opacity-50"
            >
              {batchLoading ? 'Loading…' : 'Another batch'}
            </button>
          )}
          <button
            onClick={handleDoneExit}
            className="w-full py-2.5 text-cream-dim/70 text-sm hover:text-cream transition-colors"
          >
            Done
          </button>
        </>
      }
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

function RouletteStage({
  shortlist,
  onResult,
  onBack,
  spinsLeft,
  onSpinsLeftChange,
}: {
  shortlist: SessionMovie[];
  onResult: (sm: SessionMovie) => void;
  onBack: () => void;
  spinsLeft: number;
  onSpinsLeftChange: (n: number) => void;
}) {
  return (
    <div className="w-full flex flex-col items-center">
      <ClientRouletteWheel
        movies={shortlist}
        onResult={onResult}
        spinsLeft={spinsLeft}
        onSpinsLeftChange={onSpinsLeftChange}
      />
      <button
        onClick={onBack}
        className="mt-4 py-2.5 px-6 text-cream-dim/70 text-sm hover:text-cream transition-colors"
      >
        Back to shortlist
      </button>
    </div>
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
      className="flex flex-col items-center text-center w-full max-w-sm"
    >
      <h2
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: 'var(--font-playfair)' }}
      >
        You skipped everything
      </h2>
      <p className="text-cream-dim text-lg mb-8">
        {batchExhausted
          ? 'No more movies match these filters.'
          : 'Try another batch, or adjust your filters from the dashboard.'}
      </p>
      <div className="flex flex-col gap-3 w-full">
        {!batchExhausted && (
          <button
            onClick={onAnotherBatch}
            disabled={batchLoading}
            className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors disabled:opacity-50"
          >
            {batchLoading ? 'Loading…' : 'Another batch'}
          </button>
        )}
        {undoCount > 0 && (
          <button
            onClick={onUndo}
            className="w-full py-3 glass rounded-xl text-cream-dim font-medium hover:text-cream transition-colors"
          >
            Undo last swipe
          </button>
        )}
        <button
          onClick={onDone}
          className="w-full py-2.5 text-cream-dim/70 text-sm hover:text-cream transition-colors"
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
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 15 }}
      className="w-full max-w-sm"
    >
      <div className="glass rounded-3xl overflow-hidden match-pulse">
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
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card/70 to-transparent" />
          <div className="absolute top-4 left-4 px-3 py-1 bg-coral rounded-full">
            <span className="text-charcoal text-xs font-bold">TODAY&apos;S PICK</span>
          </div>
          {movie.inCinema && (
            <div className="absolute top-4 right-4">
              <InCinemaBadge />
            </div>
          )}
        </div>

        <div className="h-4 ticket-edge" />

        <div className="p-6">
          <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-playfair)' }}>
            {movie.title}
          </h2>
          <div className="flex items-center gap-3 text-cream-dim text-sm mb-3">
            <span>{movie.year}</span>
            {movie.runtime && <span>{movie.runtime} min</span>}
            {movie.tmdbRating && <span className="text-danger">&#9733; {movie.tmdbRating.toFixed(1)}</span>}
          </div>
          {movie.director && (
            <p className="text-cream-dim text-sm mb-3">Directed by {movie.director}</p>
          )}
          {movie.streamingProviders && movie.streamingProviders.length > 0 && (
            <div className="mt-3">
              <StreamingProvidersList providers={movie.streamingProviders} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {canPickAgain && (
          <button
            onClick={onPickAgain}
            className="w-full py-3 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors"
          >
            Pick again
          </button>
        )}
        <button
          onClick={onBack}
          className="w-full py-3 glass rounded-xl text-cream-dim font-medium hover:text-cream transition-colors"
        >
          Back to shortlist
        </button>
        <button
          onClick={onDone}
          className="w-full py-2.5 text-cream-dim/70 text-sm hover:text-cream transition-colors"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}
