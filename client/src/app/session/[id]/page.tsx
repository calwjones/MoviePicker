'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { sessionApi, swipeApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { connectSocket, getSocket } from '@/lib/socket';
import { enqueueSwipe, flushQueue, hasQueuedSwipes } from '@/lib/swipeQueue';
import SwipeView from '@/components/SwipeView';
import InCinemaBadge from '@/components/InCinemaBadge';
import ToastContainer from '@/components/ToastContainer';
import ClientRouletteWheel from '@/components/ClientRouletteWheel';
import MatchesRevealView from '@/components/MatchesRevealView';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import type { SessionMovie, Movie, StreamingProvider, Match } from '@shared/types';

function matchToSessionMovie(m: Match): SessionMovie {
  return { id: m.id, movieId: m.movieId, movie: m.movie, user1Swipe: null, user2Swipe: null };
}

interface SessionWithMovies {
  movies: SessionMovie[];
  status: string;
}

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
  const [isHost, setIsHost] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesFetched, setMatchesFetched] = useState(false);
  const [winner, setWinner] = useState<Match | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchExhausted, setBatchExhausted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { toasts, addToast, removeToast } = useToast();
  const hasConnectedRef = useRef(false);
  const wasPartnerOnlineRef = useRef(false);

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
    revealTimers.current = matches.map((_, i) =>
      setTimeout(() => setRevealIndex(i), (i + 1) * 350),
    );
  }, [matches]);

  const revealAll = useCallback(() => {
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = [];
    setRevealIndex(matches.length - 1);
  }, [matches.length]);

  const applySessionBatch = useCallback((session: SessionWithMovies, hostFlag: boolean) => {
    const swipeField = hostFlag ? 'user1Swipe' : 'user2Swipe';
    const unswiped = session.movies.filter((m: SessionMovie) => m[swipeField] === null);
    for (let i = unswiped.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unswiped[i], unswiped[j]] = [unswiped[j], unswiped[i]];
    }
    const otherField = hostFlag ? 'user2Swipe' : 'user1Swipe';
    const partnerSwipedCount = session.movies.filter((m: SessionMovie) => m[otherField] !== null).length;
    const total = session.movies.length;
    setMovies(unswiped);
    setCurrentIndex(0);
    setUndoStack([]);
    setDone(false);
    setSessionComplete(false);
    setWinner(null);
    setMatches([]);
    setMatchesFetched(false);
    setRouletteOpen(false);
    setRevealed(false);
    setRevealIndex(-1);
    setPartnerProgress(total > 0 ? Math.round((partnerSwipedCount / total) * 100) : 0);
  }, []);

  useEffect(() => {
    if (!sessionId || !user || authLoading) return;
    sessionApi.get(sessionId).then((res) => {
      const { session, isUser1: iu1 } = res.data;
      setIsHost(iu1);
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
      const partnerSwipedCount = session.movies.filter((m: SessionMovie) => m[otherField] !== null).length;
      const total = session.movies.length;
      setPartnerProgress(total > 0 ? Math.round((partnerSwipedCount / total) * 100) : 0);
      if (session.status === 'completed') {
        setDone(true);
        setSessionComplete(true);
      } else if (unswiped.length === 0 && swiped.length > 0) {
        setDone(true);
      }
      setLoading(false);
    }).catch(() => router.push('/dashboard'));
  }, [sessionId, user, authLoading, router]);

  useEffect(() => {
    if (!sessionComplete || matchesFetched) return;
    swipeApi.matches(sessionId).then((res) => {
      setMatches(res.data.matches || []);
      setMatchesFetched(true);
    }).catch(() => {
      setMatchesFetched(true);
    });
  }, [sessionComplete, matchesFetched, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    connectSocket();
    const socket = getSocket();
    socket.emit('join-session', sessionId);

    const handleSwipeUpdate = (data: { progress: number }) => {
      if (data.progress !== undefined) setPartnerProgress(data.progress);
    };
    const handleSessionComplete = (data: { matches?: Match[] }) => {
      setSessionComplete(true);
      if (data?.matches) {
        setMatches(data.matches);
        setMatchesFetched(true);
      }
    };
    const handleNewBatch = (data: { session?: SessionWithMovies }) => {
      if (data?.session) {
        applySessionBatch(data.session, isHost);
      } else {
        sessionApi.get(sessionId).then((res) => applySessionBatch(res.data.session, isHost)).catch(() => {});
      }
    };
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
      if (hasQueuedSwipes()) {
        flushQueue().then((res) => {
          if (res.flushed > 0) {
            addToast(`Synced ${res.flushed} swipe${res.flushed === 1 ? '' : 's'}`, { variant: 'success' });
          }
        });
      }
    };

    socket.on('swipe-update', handleSwipeUpdate);
    socket.on('session-complete', handleSessionComplete);
    socket.on('new-batch', handleNewBatch);
    socket.on('partner-done', handlePartnerDone);
    socket.on('partner-online', handlePartnerOnline);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleConnect);
    if (socket.connected) hasConnectedRef.current = true;

    return () => {
      socket.off('swipe-update', handleSwipeUpdate);
      socket.off('session-complete', handleSessionComplete);
      socket.off('new-batch', handleNewBatch);
      socket.off('partner-done', handlePartnerDone);
      socket.off('partner-online', handlePartnerOnline);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleConnect);
    };
  }, [sessionId, addToast, removeToast, applySessionBatch, isHost]);

  const handleSwipe = useCallback(async (direction: 'left' | 'right') => {
    if (currentIndex >= movies.length || swiping) return;
    const movie = movies[currentIndex];
    setSwiping(true);
    setSwipeError('');
    const socket = getSocket();
    const advance = () => {
      setUndoStack((prev) => [...prev.slice(-9), { index: currentIndex, movieId: movie.movieId, direction }]);
      if (currentIndex + 1 >= movies.length) {
        setDone(true);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    };
    if (!socket.connected) {
      enqueueSwipe({ sessionId, movieId: movie.movieId, direction });
      advance();
      setSwiping(false);
      return;
    }
    try {
      await swipeApi.swipe(sessionId, movie.movieId, direction);
      advance();
      if (currentIndex + 1 >= movies.length) {
        const res = await swipeApi.done(sessionId);
        if (res.data.status === 'completed') {
          setSessionComplete(true);
          if (res.data.matches) {
            setMatches(res.data.matches);
            setMatchesFetched(true);
          }
        }
      }
    } catch {
      enqueueSwipe({ sessionId, movieId: movie.movieId, direction });
      advance();
    } finally {
      setSwiping(false);
    }
  }, [currentIndex, movies, sessionId, swiping]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    try {
      await swipeApi.undo(sessionId, last.movieId);
      setUndoStack((prev) => prev.slice(0, -1));
      if (done) setDone(false);
      setCurrentIndex(last.index);
    } catch { /* swallow */ }
  }, [undoStack, done, sessionId]);

  const handleAnotherBatch = async () => {
    if (!isHost) return;
    setBatchLoading(true);
    try {
      const res = await sessionApi.anotherBatch(sessionId);
      if (res.data.added === 0) {
        setBatchExhausted(true);
        addToast('No more movies match your filters', { variant: 'info' });
        return;
      }
      if (res.data.session) {
        applySessionBatch(res.data.session, isHost);
      }
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load more movies'), { variant: 'error' });
    } finally {
      setBatchLoading(false);
    }
  };

  const handlePickForToday = () => {
    if (matches.length === 0) return;
    if (matches.length === 1) {
      setWinner(matches[0]);
      return;
    }
    setRouletteOpen(true);
  };

  const handleRouletteResult = (sm: SessionMovie) => {
    const match = matches.find((m) => m.id === sm.id) ?? null;
    if (match) setWinner(match);
  };

  const handlePickAgain = () => {
    setWinner(null);
    if (matches.length > 1) setRouletteOpen(true);
  };

  const handleBackToShortlist = () => {
    setWinner(null);
    setRouletteOpen(false);
  };

  const handleDoneExit = () => {
    router.push('/dashboard');
  };

  const doneContent = winner ? (
    <WinnerCard
      movie={winner.movie}
      canPickAgain={matches.length > 1}
      onPickAgain={handlePickAgain}
      onBack={handleBackToShortlist}
      onDone={handleDoneExit}
    />
  ) : rouletteOpen && matches.length >= 2 ? (
    <GroupRouletteStage
      matches={matches}
      onResult={handleRouletteResult}
      onBack={handleBackToShortlist}
    />
  ) : sessionComplete && !matchesFetched ? (
    <div className="flex flex-col items-center gap-3">
      <LoadingSpinner size="md" />
      <p className="text-cream-dim text-sm">Loading matches…</p>
    </div>
  ) : sessionComplete && matches.length > 0 ? (
    <MatchesRevealView
      items={matches.map((m) => ({ id: m.id, movie: m.movie }))}
      title="Swiping complete!"
      counterLine={`You have ${matches.length} match${matches.length === 1 ? '' : 'es'} you both liked`}
      revealCTA={matches.length === 1 ? 'Reveal Your Match' : 'Reveal Matches'}
      revealed={revealed}
      revealIndex={revealIndex}
      onStartReveal={startReveal}
      onRevealAll={revealAll}
      postRevealTitle="Your Matches"
      actions={
        <>
          <button
            onClick={handlePickForToday}
            className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors"
          >
            {matches.length >= 2 ? 'Spin the Roulette' : 'Pick one for today'}
          </button>
          {isHost && !batchExhausted && (
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
  ) : sessionComplete ? (
    <NoMatches
      isHost={isHost}
      onAnotherBatch={handleAnotherBatch}
      onDone={handleDoneExit}
      batchLoading={batchLoading}
      batchExhausted={batchExhausted}
    />
  ) : (
    <WaitingForPartner
      partnerProgress={partnerProgress}
      undoCount={undoStack.length}
      onUndo={handleUndo}
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

function WaitingForPartner({
  partnerProgress,
  undoCount,
  onUndo,
}: {
  partnerProgress: number;
  undoCount: number;
  onUndo: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center text-center"
    >
      <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'var(--font-playfair)' }}>
        All done!
      </h2>
      <p className="text-cream-dim text-lg mb-2">Waiting for your partner to finish swiping…</p>
      <div className="w-48 h-2 bg-card rounded-full mx-auto mt-4 overflow-hidden">
        <motion.div
          className="h-full bg-coral rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(partnerProgress, 100)}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <p className="text-cream-dim text-sm mt-2">Partner: {Math.min(partnerProgress, 100)}%</p>
      {undoCount > 0 && (
        <button
          onClick={onUndo}
          className="mt-4 py-2 px-6 glass rounded-xl text-cream-dim text-sm hover:bg-card-hover transition-colors"
        >
          Undo last swipe
        </button>
      )}
    </motion.div>
  );
}

function GroupRouletteStage({
  matches,
  onResult,
  onBack,
}: {
  matches: Match[];
  onResult: (sm: SessionMovie) => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full flex flex-col items-center">
      <ClientRouletteWheel
        movies={matches.map(matchToSessionMovie)}
        onResult={onResult}
      />
      <button
        onClick={onBack}
        className="mt-4 py-2.5 px-6 text-cream-dim/70 text-sm hover:text-cream transition-colors"
      >
        Back to matches
      </button>
    </div>
  );
}

function NoMatches({
  isHost,
  onAnotherBatch,
  onDone,
  batchLoading,
  batchExhausted,
}: {
  isHost: boolean;
  onAnotherBatch: () => void;
  onDone: () => void;
  batchLoading: boolean;
  batchExhausted: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center text-center w-full max-w-sm"
    >
      <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-playfair)' }}>
        No exact matches
      </h2>
      <p className="text-cream-dim text-lg mb-8">
        {isHost
          ? batchExhausted
            ? 'No more movies match your filters.'
            : 'Pull in another batch, or call it a night.'
          : 'Waiting on your partner to pull another batch or call it.'}
      </p>
      <div className="flex flex-col gap-3 w-full">
        {isHost && !batchExhausted && (
          <button
            onClick={onAnotherBatch}
            disabled={batchLoading}
            className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors disabled:opacity-50"
          >
            {batchLoading ? 'Loading…' : 'Another batch'}
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
  const streaming = (movie.streamingProviders ?? []).filter((p: StreamingProvider) => p.type === 'stream');

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
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
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
          Back to matches
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
