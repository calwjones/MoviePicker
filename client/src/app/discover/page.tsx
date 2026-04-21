'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { discoverApi, movieApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { clearSwipeFilters } from '@/lib/filters';
import SwipeView from '@/components/SwipeView';
import InCinemaBadge from '@/components/InCinemaBadge';
import ToastContainer from '@/components/ToastContainer';
import ClientRouletteWheel from '@/components/ClientRouletteWheel';
import MatchesRevealView from '@/components/MatchesRevealView';
import StreamingProvidersList from '@/components/StreamingProviders';
import { FullPageSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import type { SessionMovie, Movie, SearchResult } from '@shared/types';

function toAdapterMovie(r: SearchResult): Movie {
  return {
    id: `tmdb-${r.tmdbId}`,
    tmdbId: r.tmdbId,
    title: r.title,
    year: r.year,
    posterUrl: r.posterUrl,
    overview: r.overview,
    genres: [],
    director: null,
    cast: [],
    runtime: null,
    tmdbRating: r.rating,
    streamingProviders: [],
    inCinema: r.inCinema,
  };
}

function toAdapterSessionMovie(r: SearchResult): SessionMovie {
  const movie = toAdapterMovie(r);
  return {
    id: movie.id,
    movieId: movie.id,
    movie,
    user1Swipe: null,
    user2Swipe: null,
  };
}

function parseFiltersFromQuery(sp: URLSearchParams) {
  const genresRaw = sp.get('genres') ?? '';
  const genres = genresRaw.length > 0 ? genresRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const decade = sp.get('decade') ?? '';
  const minRating = parseFloat(sp.get('minRating') ?? '0') || 0;
  const batchSize = parseInt(sp.get('batchSize') ?? '50', 10) || 50;
  const providersRaw = sp.get('providers') ?? '';
  let providers: number[] | 'none' = 'none';
  if (providersRaw === 'none') providers = 'none';
  else if (providersRaw.length > 0) {
    const ids = providersRaw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n) && n > 0);
    providers = ids.length > 0 ? ids : 'none';
  }
  return { genres, decade, minRating, batchSize, providers };
}

function DiscoverSwipePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuthGuard();
  const { toasts, addToast } = useToast();

  const queryFilters = useMemo(
    () => parseFiltersFromQuery(new URLSearchParams(searchParams?.toString() ?? '')),
    [searchParams],
  );

  const [movies, setMovies] = useState<SessionMovie[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [shortlist, setShortlist] = useState<SessionMovie[]>([]);
  const [undoStack, setUndoStack] = useState<{ index: number; movieId: string; direction: string }[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [swipeError, setSwipeError] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchExhausted, setBatchExhausted] = useState(false);
  const [page, setPage] = useState(1);
  const [seenTmdbIds, setSeenTmdbIds] = useState<Set<number>>(new Set());

  const [winner, setWinner] = useState<SessionMovie | null>(null);
  const [winnerFull, setWinnerFull] = useState<Movie | null>(null);
  const [winnerLoading, setWinnerLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [previousPickIds, setPreviousPickIds] = useState<string[]>([]);
  const [spinsLeft, setSpinsLeft] = useState(3);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [addedTmdbIds, setAddedTmdbIds] = useState<Set<number>>(new Set());
  const [addingTmdbId, setAddingTmdbId] = useState<number | null>(null);
  const movieIdByTmdb = useRef<Map<number, string>>(new Map());

  const [enrichedTmdbIds, setEnrichedTmdbIds] = useState<Set<number>>(new Set());
  const [enrichingTmdbId, setEnrichingTmdbId] = useState<number | null>(null);

  const fetchPage = useCallback(async (targetPage: number) => {
    const res = await discoverApi.movies({
      genres: queryFilters.genres,
      minRating: queryFilters.minRating > 0 ? queryFilters.minRating : undefined,
      decade: queryFilters.decade || undefined,
      page: targetPage,
      providers: queryFilters.providers,
    });
    return {
      movies: (res.data.movies ?? []) as SearchResult[],
      totalPages: (res.data.totalPages ?? 1) as number,
      providerDropped: Boolean(res.data.providerDropped),
    };
  }, [queryFilters]);

  useEffect(() => {
    if (!user || authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchPage(1);
        if (cancelled) return;
        if (result.movies.length === 0) {
          setSwipeError('No movies match these filters — try broadening them.');
          setLoading(false);
          return;
        }
        if (result.providerDropped) {
          addToast('No matches on your selected streamers — showing broadly available titles.', {
            variant: 'info',
            duration: 6000,
          });
        }
        const capped = result.movies.slice(0, queryFilters.batchSize);
        setMovies(capped.map(toAdapterSessionMovie));
        setSeenTmdbIds(new Set(capped.map((m) => m.tmdbId)));
        setPage(1);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setSwipeError(getErrorMessage(err, 'Failed to load movies'));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, fetchPage, queryFilters.batchSize, addToast]);

  const handleSwipe = useCallback(async (direction: 'left' | 'right') => {
    if (currentIndex >= movies.length) return;
    const sm = movies[currentIndex];
    setUndoStack((prev) => [...prev.slice(-9), { index: currentIndex, movieId: sm.movieId, direction }]);
    if (direction === 'right') setShortlist((prev) => [...prev, sm]);
    if (currentIndex + 1 >= movies.length) setDone(true);
    else setCurrentIndex((i) => i + 1);
  }, [currentIndex, movies]);

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

  useEffect(() => {
    return () => {
      revealTimers.current.forEach(clearTimeout);
      revealTimers.current = [];
    };
  }, []);

  const handleExpand = useCallback(async (movie: Movie) => {
    const tmdbId = movie.tmdbId;
    if (!tmdbId || enrichedTmdbIds.has(tmdbId)) return;
    setEnrichingTmdbId(tmdbId);
    try {
      const res = await movieApi.getByTmdbId(tmdbId);
      const full = res.data.movie as Movie;
      setMovies((prev) => prev.map((sm) => (
        sm.movie.tmdbId === tmdbId ? { ...sm, movie: { ...sm.movie, ...full, inCinema: sm.movie.inCinema } } : sm
      )));
      setShortlist((prev) => prev.map((sm) => (
        sm.movie.tmdbId === tmdbId ? { ...sm, movie: { ...sm.movie, ...full, inCinema: sm.movie.inCinema } } : sm
      )));
      setEnrichedTmdbIds((prev) => new Set(prev).add(tmdbId));
    } catch {
      // leave sparse
    } finally {
      setEnrichingTmdbId((id) => (id === tmdbId ? null : id));
    }
  }, [enrichedTmdbIds]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    if (last.direction === 'right') {
      setShortlist((prev) => prev.filter((m) => m.movieId !== last.movieId));
    }
    if (done) setDone(false);
    setCurrentIndex(last.index);
  }, [undoStack, done]);

  const handleAnotherBatch = async () => {
    setBatchLoading(true);
    try {
      const nextPage = page + 1;
      const result = await fetchPage(nextPage);
      const fresh = result.movies.filter((m) => !seenTmdbIds.has(m.tmdbId));
      if (fresh.length === 0) {
        setBatchExhausted(true);
        addToast('No more movies match these filters', { variant: 'info' });
        return;
      }
      const capped = fresh.slice(0, queryFilters.batchSize);
      setMovies(capped.map(toAdapterSessionMovie));
      setSeenTmdbIds((prev) => {
        const next = new Set(prev);
        for (const m of capped) next.add(m.tmdbId);
        return next;
      });
      setPage(nextPage);
      setCurrentIndex(0);
      setUndoStack([]);
      setDone(false);
      setWinner(null);
      setWinnerFull(null);
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

  const loadWinnerFull = async (sm: SessionMovie) => {
    const tmdbId = sm.movie.tmdbId;
    if (!tmdbId) return;
    setWinnerLoading(true);
    try {
      const res = await movieApi.getByTmdbId(tmdbId);
      setWinnerFull(res.data.movie);
    } catch {
      // keep sparse data
    } finally {
      setWinnerLoading(false);
    }
  };

  const handlePickForToday = () => {
    const remaining = shortlist.filter((sm) => !previousPickIds.includes(sm.id));
    if (remaining.length === 0) return;
    if (remaining.length === 1) {
      const pick = remaining[0];
      setWinner(pick);
      setWinnerFull(null);
      loadWinnerFull(pick);
      return;
    }
    setRouletteOpen(true);
  };

  const handleRouletteResult = (pick: SessionMovie) => {
    setWinner(pick);
    setWinnerFull(null);
    loadWinnerFull(pick);
  };

  const handlePickAgain = () => {
    if (!winner) return;
    const nextExcluded = [...previousPickIds, winner.id];
    setPreviousPickIds(nextExcluded);
    setWinner(null);
    setWinnerFull(null);
    const remaining = shortlist.filter((sm) => !nextExcluded.includes(sm.id));
    if (remaining.length === 1) {
      const pick = remaining[0];
      setWinner(pick);
      loadWinnerFull(pick);
      return;
    }
    if (remaining.length >= 2) setRouletteOpen(true);
  };

  const handleBackToShortlist = () => {
    setWinner(null);
    setWinnerFull(null);
    setRouletteOpen(false);
    setPreviousPickIds([]);
    setSpinsLeft(3);
  };

  const handleAddToWatchlist = async (tmdbId: number) => {
    setAddingTmdbId(tmdbId);
    try {
      const res = await movieApi.add(tmdbId);
      const movieId = res.data.movie?.id as string | undefined;
      if (movieId) movieIdByTmdb.current.set(tmdbId, movieId);
      setAddedTmdbIds((prev) => new Set(prev).add(tmdbId));
      addToast('Added to watchlist', { variant: 'success' });
    } catch {
      addToast('Failed to add movie', { variant: 'error' });
    } finally {
      setAddingTmdbId(null);
    }
  };

  const handleToggleWatchedOnReveal = async (
    item: { movie: Movie },
    nextWatched: boolean,
  ): Promise<boolean> => {
    const tmdbId = item.movie.tmdbId;
    if (!tmdbId) return false;
    try {
      let movieId = movieIdByTmdb.current.get(tmdbId);
      if (!movieId) {
        const addRes = await movieApi.add(tmdbId);
        movieId = addRes.data.movie?.id as string | undefined;
        if (!movieId) throw new Error('missing movie id');
        movieIdByTmdb.current.set(tmdbId, movieId);
        setAddedTmdbIds((prev) => new Set(prev).add(tmdbId));
      }
      await movieApi.markWatched(movieId, nextWatched);
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
  };

  const handleDoneExit = () => {
    clearSwipeFilters();
    router.push('/dashboard');
  };

  const allAdded = shortlist.every((sm) => sm.movie.tmdbId != null && addedTmdbIds.has(sm.movie.tmdbId));
  const handleAddAll = () => {
    for (const sm of shortlist) {
      if (sm.movie.tmdbId && !addedTmdbIds.has(sm.movie.tmdbId)) {
        handleAddToWatchlist(sm.movie.tmdbId);
      }
    }
  };

  const rouletteShortlist = shortlist.filter((sm) => !previousPickIds.includes(sm.id));
  const canPickAgain = shortlist.length - previousPickIds.length > 1;

  const doneContent = winner ? (
    <DiscoverWinnerCard
      sm={winner}
      full={winnerFull}
      loading={winnerLoading}
      added={addedTmdbIds.has(winner.movie.tmdbId ?? -1)}
      adding={addingTmdbId === winner.movie.tmdbId}
      canPickAgain={canPickAgain}
      onAdd={() => winner.movie.tmdbId && handleAddToWatchlist(winner.movie.tmdbId)}
      onPickAgain={handlePickAgain}
      onBack={handleBackToShortlist}
      onDone={handleDoneExit}
    />
  ) : rouletteOpen && rouletteShortlist.length >= 2 ? (
    <DiscoverRouletteStage
      shortlist={rouletteShortlist}
      onResult={handleRouletteResult}
      onBack={handleBackToShortlist}
      spinsLeft={spinsLeft}
      onSpinsLeftChange={setSpinsLeft}
    />
  ) : shortlist.length === 0 ? (
    <DiscoverEmptyShortlist
      onAnotherBatch={handleAnotherBatch}
      onDone={handleDoneExit}
      onUndo={handleUndo}
      undoCount={undoStack.length}
      batchLoading={batchLoading}
      batchExhausted={batchExhausted}
    />
  ) : (
    <MatchesRevealView
      items={shortlist}
      title="Swiping complete!"
      counterLine={`You have ${shortlist.length} pick${shortlist.length === 1 ? '' : 's'}`}
      revealCTA={shortlist.length === 1 ? 'Reveal Your Pick' : 'Reveal Picks'}
      postRevealTitle="Your Shortlist"
      revealed={revealed}
      revealIndex={revealIndex}
      onStartReveal={startReveal}
      onRevealAll={revealAll}
      onToggleWatched={handleToggleWatchedOnReveal}
      renderCardBadge={(item) => {
        const tmdbId = item.movie.tmdbId;
        if (!tmdbId) return null;
        const added = addedTmdbIds.has(tmdbId);
        const adding = addingTmdbId === tmdbId;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); handleAddToWatchlist(tmdbId); }}
            disabled={added || adding}
            aria-label={added ? 'Added to watchlist' : 'Add to watchlist'}
            className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold transition-colors disabled:opacity-80 ${
              added ? 'bg-success/90 text-charcoal' : 'bg-coral text-charcoal hover:bg-coral-dark'
            }`}
          >
            {adding ? '…' : added ? '✓' : '+'}
          </button>
        );
      }}
      actions={
        <>
          {shortlist.length >= 2 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePickForToday}
              className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors"
            >
              Spin the Roulette
            </motion.button>
          )}
          {shortlist.length === 1 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePickForToday}
              className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors"
            >
              Pick one for today
            </motion.button>
          )}
          <button
            onClick={handleAddAll}
            disabled={allAdded}
            className="w-full py-3 glass rounded-xl text-coral font-semibold text-sm hover:bg-card-hover transition-colors disabled:opacity-50"
          >
            {allAdded ? 'All saved to watchlist' : 'Save all to watchlist'}
          </button>
          {!batchExhausted && (
            <button
              onClick={handleAnotherBatch}
              disabled={batchLoading}
              className="w-full py-3 glass rounded-xl text-cream-dim font-medium text-sm hover:text-cream transition-colors disabled:opacity-50"
            >
              {batchLoading ? 'Loading…' : 'Another batch'}
            </button>
          )}
          <button
            onClick={handleDoneExit}
            className="w-full py-2.5 text-cream-dim/70 text-xs hover:text-cream transition-colors"
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
        swiping={false}
        swipeError={swipeError}
        loading={loading}
        done={done}
        doneContent={doneContent}
        onExpand={handleExpand}
        detailLoading={enrichingTmdbId != null}
      />
      <ToastContainer toasts={toasts} />
    </>
  );
}

export default function DiscoverSwipePage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <DiscoverSwipePageInner />
    </Suspense>
  );
}

function DiscoverRouletteStage({
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
        className="mt-4 py-2 px-6 glass rounded-xl text-cream-dim text-sm font-medium hover:bg-card-hover transition-colors"
      >
        Back to shortlist
      </button>
    </div>
  );
}

function DiscoverEmptyShortlist({
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
            : 'Try another batch, or head back to change filters.'}
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

function DiscoverWinnerCard({
  sm,
  full,
  loading,
  added,
  adding,
  canPickAgain,
  onAdd,
  onPickAgain,
  onBack,
  onDone,
}: {
  sm: SessionMovie;
  full: Movie | null;
  loading: boolean;
  added: boolean;
  adding: boolean;
  canPickAgain: boolean;
  onAdd: () => void;
  onPickAgain: () => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const movie = full ?? sm.movie;

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
          <h2 className="text-2xl font-bold mb-2 font-display">{movie.title}</h2>
          <div className="flex items-center gap-3 text-cream-dim text-sm mb-3">
            <span>{movie.year}</span>
            {movie.runtime && <span>{movie.runtime} min</span>}
            {movie.tmdbRating && <span className="text-danger">&#9733; {movie.tmdbRating.toFixed(1)}</span>}
          </div>
          {movie.director && (
            <p className="text-cream-dim text-sm mb-3">Directed by {movie.director}</p>
          )}
          {loading && !full && (
            <p className="text-cream-dim text-xs animate-pulse">Loading details…</p>
          )}
          {movie.streamingProviders && movie.streamingProviders.length > 0 && (
            <div className="mt-3">
              <StreamingProvidersList providers={movie.streamingProviders} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <button
          onClick={onAdd}
          disabled={added || adding}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 ${
            added ? 'bg-success/20 text-success' : 'bg-coral text-charcoal hover:bg-coral-dark'
          }`}
        >
          {adding ? 'Adding…' : added ? 'Added to watchlist' : 'Add to watchlist'}
        </button>
        {canPickAgain && (
          <button
            onClick={onPickAgain}
            className="w-full py-3 glass rounded-xl text-cream-dim text-sm hover:text-cream transition-colors"
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
