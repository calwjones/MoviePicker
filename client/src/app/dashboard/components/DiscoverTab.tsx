'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { discoverApi, movieApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import MoviePoster from '@/components/MoviePoster';
import LoadingSpinner from '@/components/LoadingSpinner';
import { DECADE_OPTIONS } from '@/lib/decades';
import type { Movie, SearchResult, StreamingProvider } from '@shared/types';

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music',
  'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western',
];

type Phase = 'filters' | 'swiping' | 'results' | 'winner';

interface DiscoverFilters {
  genres: string[];
  minRating: number;
  decade: string;
}

interface DiscoverTabProps {
  addToast: (message: string) => void;
}

export default function DiscoverTab({ addToast }: DiscoverTabProps) {
  const [phase, setPhase] = useState<Phase>('filters');
  const [filters, setFilters] = useState<DiscoverFilters>({ genres: [], minRating: 0, decade: '' });

  const [cards, setCards] = useState<SearchResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [shortlist, setShortlist] = useState<SearchResult[]>([]);
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const prefetchingRef = useRef(false);

  const [addingTmdbId, setAddingTmdbId] = useState<number | null>(null);
  const [addedTmdbIds, setAddedTmdbIds] = useState<Set<number>>(new Set());

  const [winner, setWinner] = useState<SearchResult | null>(null);
  const [winnerFull, setWinnerFull] = useState<Movie | null>(null);
  const [winnerLoading, setWinnerLoading] = useState(false);

  const fetchPage = useCallback(async (targetPage: number): Promise<{ movies: SearchResult[]; totalPages: number } | null> => {
    try {
      const res = await discoverApi.movies({
        genres: filters.genres,
        minRating: filters.minRating > 0 ? filters.minRating : undefined,
        decade: filters.decade || undefined,
        page: targetPage,
      });
      return { movies: res.data.movies || [], totalPages: res.data.totalPages || 1 };
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load movies'));
      return null;
    }
  }, [filters]);

  const handleStart = async () => {
    setLoading(true);
    setError('');
    const result = await fetchPage(1);
    setLoading(false);
    if (!result) return;
    if (result.movies.length === 0) {
      setError('No movies match these filters — try broadening them.');
      return;
    }
    setCards(result.movies);
    setTotalPages(result.totalPages);
    setPage(1);
    setCurrentIndex(0);
    setShortlist([]);
    setAddedTmdbIds(new Set());
    setPhase('swiping');
  };

  useEffect(() => {
    if (phase !== 'swiping') return;
    if (prefetchingRef.current) return;
    if (page >= totalPages) return;
    if (currentIndex < cards.length - 3) return;

    prefetchingRef.current = true;
    fetchPage(page + 1).then((result) => {
      if (result) {
        setCards((prev) => {
          const existing = new Set(prev.map((m) => m.tmdbId));
          const fresh = result.movies.filter((m) => !existing.has(m.tmdbId));
          return [...prev, ...fresh];
        });
        setTotalPages(result.totalPages);
        setPage((p) => p + 1);
      }
      prefetchingRef.current = false;
    });
  }, [phase, currentIndex, cards.length, page, totalPages, fetchPage]);

  useEffect(() => {
    if (phase === 'swiping' && currentIndex >= cards.length && cards.length > 0 && page >= totalPages) {
      setPhase('results');
    }
  }, [phase, currentIndex, cards.length, page, totalPages]);

  const commit = (dir: 'left' | 'right') => {
    if (exitDir) return;
    const card = cards[currentIndex];
    if (!card) return;
    setExitDir(dir);
    if (dir === 'right') setShortlist((prev) => [...prev, card]);
    setCurrentIndex((i) => i + 1);
  };

  const handleDone = () => {
    setPhase('results');
  };

  const handleKeepSwiping = () => {
    if (currentIndex >= cards.length && page < totalPages) return;
    setPhase('swiping');
  };

  const handleStartOver = () => {
    setCards([]);
    setShortlist([]);
    setCurrentIndex(0);
    setPage(1);
    setTotalPages(1);
    setAddedTmdbIds(new Set());
    setWinner(null);
    setWinnerFull(null);
    setPhase('filters');
  };

  const handleAddOne = async (rec: SearchResult) => {
    setAddingTmdbId(rec.tmdbId);
    try {
      await movieApi.add(rec.tmdbId);
      setAddedTmdbIds((prev) => new Set(prev).add(rec.tmdbId));
      addToast(`Added "${rec.title}"`);
    } catch {
      addToast('Failed to add movie');
    } finally {
      setAddingTmdbId(null);
    }
  };

  const handleAddAll = async () => {
    const pending = shortlist.filter((m) => !addedTmdbIds.has(m.tmdbId));
    if (pending.length === 0) return;
    try {
      await Promise.all(pending.map((m) => movieApi.add(m.tmdbId)));
      setAddedTmdbIds((prev) => {
        const next = new Set(prev);
        for (const m of pending) next.add(m.tmdbId);
        return next;
      });
      addToast(`Added ${pending.length} movies to your watchlist`);
    } catch {
      addToast('Failed to add some movies');
    }
  };

  const handlePickForTonight = async (excludeTmdbId?: number) => {
    if (shortlist.length === 0) return;
    const eligible = excludeTmdbId !== undefined && shortlist.length > 1
      ? shortlist.filter((m) => m.tmdbId !== excludeTmdbId)
      : shortlist;
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    setWinner(pick);
    setWinnerFull(null);
    setPhase('winner');
    setWinnerLoading(true);
    try {
      const res = await movieApi.getByTmdbId(pick.tmdbId);
      setWinnerFull(res.data.movie);
    } catch {
      // non-critical — show winner with basic data
    } finally {
      setWinnerLoading(false);
    }
  };

  const handlePickAgain = () => {
    handlePickForTonight(winner?.tmdbId);
  };

  const toggleGenre = (genre: string) => {
    setFilters((prev) => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter((g) => g !== genre)
        : [...prev.genres, genre],
    }));
  };

  return (
    <motion.div
      key="discover"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-4"
    >
      {phase === 'filters' && (
        <div className="glass rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold font-display">Discover</h2>
            <p className="text-cream-dim text-xs mt-1">
              Swipe popular movies outside your watchlist. Build a shortlist or pick one for tonight.
            </p>
          </div>

          <div>
            <label className="text-cream-dim text-sm mb-2 block">Genres</label>
            <div className="flex flex-wrap gap-2">
              {GENRE_OPTIONS.map((genre) => (
                <button
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 ${
                    filters.genres.includes(genre)
                      ? 'bg-coral text-charcoal'
                      : 'glass text-cream-dim'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-cream-dim text-sm mb-2 block">Decade</label>
            <div className="flex flex-wrap gap-2">
              {DECADE_OPTIONS.map((decade) => (
                <button
                  key={decade}
                  onClick={() => setFilters((p) => ({ ...p, decade: p.decade === decade ? '' : decade }))}
                  className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 ${
                    filters.decade === decade ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
                  }`}
                >
                  {decade}s
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-cream-dim text-sm mb-2 block">
              Min TMDb Rating: {filters.minRating > 0 ? filters.minRating : 'Any'}
            </label>
            <input
              type="range"
              min="0"
              max="9"
              step="0.5"
              value={filters.minRating}
              onChange={(e) => setFilters((p) => ({ ...p, minRating: parseFloat(e.target.value) }))}
              className="w-full accent-coral"
            />
          </div>

          {error && (
            <div className="p-3 glass rounded-xl border border-danger/30">
              <p className="text-danger text-sm text-center">{error}</p>
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleStart}
            disabled={loading}
            className="w-full py-4 bg-coral text-charcoal font-semibold rounded-xl text-lg hover:bg-coral-dark transition-all shadow-md hover:shadow-coral/40 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" /> Loading…
              </span>
            ) : 'Start Discovering'}
          </motion.button>
        </div>
      )}

      {phase === 'swiping' && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-3 flex items-center justify-between">
            <span className="text-cream-dim text-sm">
              {shortlist.length} right-{shortlist.length === 1 ? 'swipe' : 'swipes'}
            </span>
            <button
              onClick={handleDone}
              className="text-danger text-sm font-medium hover:underline"
            >
              Done
            </button>
          </div>

          <DiscoverSwipeDeck
            cards={cards}
            currentIndex={currentIndex}
            exitDir={exitDir}
            onCommit={commit}
            onExitComplete={() => setExitDir(null)}
          />
        </div>
      )}

      {phase === 'results' && (
        <div className="glass rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold font-display">
              {shortlist.length > 0 ? 'Your shortlist' : 'Nothing caught your eye'}
            </h2>
            <p className="text-cream-dim text-xs mt-1">
              {shortlist.length > 0
                ? `${shortlist.length} movie${shortlist.length === 1 ? '' : 's'} right-swiped`
                : 'Try adjusting your filters and discover again.'}
            </p>
          </div>

          {shortlist.length === 0 ? (
            <button
              onClick={handleStartOver}
              className="w-full py-3 glass rounded-xl text-cream-dim text-sm hover:text-cream transition-colors"
            >
              Back to filters
            </button>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {shortlist.map((rec) => {
                  const added = addedTmdbIds.has(rec.tmdbId);
                  return (
                    <div key={rec.tmdbId} className="space-y-2">
                      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-lg">
                        <MoviePoster posterUrl={rec.posterUrl} title={rec.title} />
                      </div>
                      <p className="text-xs font-medium truncate">{rec.title}</p>
                      <button
                        onClick={() => handleAddOne(rec)}
                        disabled={added || addingTmdbId === rec.tmdbId}
                        className={`w-full py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-60 ${
                          added
                            ? 'bg-success/20 text-success'
                            : 'bg-coral/90 text-charcoal hover:bg-coral'
                        }`}
                      >
                        {addingTmdbId === rec.tmdbId ? '…' : added ? 'Added' : '+ Add'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleAddAll}
                  disabled={shortlist.every((m) => addedTmdbIds.has(m.tmdbId))}
                  className="w-full py-3 bg-coral text-charcoal font-semibold rounded-xl text-sm hover:bg-coral-dark transition-colors disabled:opacity-50"
                >
                  Add all to watchlist
                </button>
                {shortlist.length >= 2 && (
                  <button
                    onClick={() => handlePickForTonight()}
                    className="w-full py-3 glass rounded-xl text-danger font-semibold text-sm outline outline-1 outline-coral hover:bg-card-hover transition-colors"
                  >
                    Pick one for tonight
                  </button>
                )}
                {currentIndex < cards.length || page < totalPages ? (
                  <button
                    onClick={handleKeepSwiping}
                    className="w-full py-2.5 glass rounded-xl text-cream-dim text-sm hover:text-cream transition-colors"
                  >
                    Keep swiping
                  </button>
                ) : null}
                <button
                  onClick={handleStartOver}
                  className="w-full py-2.5 text-cream-dim/70 text-xs hover:text-cream transition-colors"
                >
                  Start over with new filters
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'winner' && winner && (
        <DiscoverWinner
          winner={winner}
          full={winnerFull}
          loading={winnerLoading}
          added={addedTmdbIds.has(winner.tmdbId)}
          onAdd={() => handleAddOne(winner)}
          onPickAgain={handlePickAgain}
          onBack={() => setPhase('results')}
        />
      )}
    </motion.div>
  );
}

function DiscoverSwipeDeck({
  cards,
  currentIndex,
  exitDir,
  onCommit,
  onExitComplete,
}: {
  cards: SearchResult[];
  currentIndex: number;
  exitDir: 'left' | 'right' | null;
  onCommit: (dir: 'left' | 'right') => void;
  onExitComplete: () => void;
}) {
  const current = cards[currentIndex];
  const next = cards[currentIndex + 1];

  if (!current) {
    return (
      <div className="glass rounded-2xl p-12 flex flex-col items-center justify-center">
        <LoadingSpinner size="md" />
        <p className="text-cream-dim text-xs mt-3">Loading more movies…</p>
      </div>
    );
  }

  return (
    <div className="relative aspect-[2/3] max-w-sm mx-auto">
      {next && (
        <div className="absolute inset-0 scale-95 opacity-60 pointer-events-none">
          <SwipeCardFace movie={next} />
        </div>
      )}
      <AnimatePresence mode="popLayout" onExitComplete={onExitComplete}>
        <motion.div
          key={current.tmdbId}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragEnd={(_, info) => {
            if (info.offset.x > 80) onCommit('right');
            else if (info.offset.x < -80) onCommit('left');
          }}
          initial={{ scale: 0.96, opacity: 0.85 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{
            x: exitDir === 'right' ? 600 : -600,
            opacity: 0,
            rotate: exitDir === 'right' ? 18 : -18,
            transition: { duration: 0.3 },
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
        >
          <SwipeCardFace movie={current} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function SwipeCardFace({ movie }: { movie: SearchResult }) {
  return (
    <div className="w-full h-full rounded-3xl overflow-hidden glass shadow-xl relative">
      <div className="absolute inset-0">
        <MoviePoster posterUrl={movie.posterUrl} title={movie.title} />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-charcoal via-charcoal/70 to-transparent p-5 pt-16">
        <h3 className="text-xl font-semibold font-display text-cream truncate">{movie.title}</h3>
        <p className="text-cream-dim text-sm">
          {movie.year}
          {movie.rating ? ` · ${movie.rating.toFixed(1)}★` : ''}
        </p>
        {movie.overview && (
          <p className="text-cream-dim text-xs mt-2 line-clamp-3">{movie.overview}</p>
        )}
      </div>
    </div>
  );
}

function DiscoverWinner({
  winner,
  full,
  loading,
  added,
  onAdd,
  onPickAgain,
  onBack,
}: {
  winner: SearchResult;
  full: Movie | null;
  loading: boolean;
  added: boolean;
  onAdd: () => void;
  onPickAgain: () => void;
  onBack: () => void;
}) {
  const streaming = (full?.streamingProviders as StreamingProvider[] | undefined)?.filter((p) => p.type === 'stream') ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 15 }}
      className="w-full max-w-sm mx-auto"
    >
      <div className="glass rounded-3xl overflow-hidden match-pulse">
        <div className="aspect-[2/3] relative">
          {winner.posterUrl ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${winner.posterUrl})` }}
            />
          ) : (
            <div className="absolute inset-0 bg-card flex items-center justify-center">
              <span className="text-cream-dim text-lg">{winner.title}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
          <div className="absolute top-4 left-4 px-3 py-1 bg-coral rounded-full">
            <span className="text-charcoal text-xs font-bold">TONIGHT&apos;S PICK</span>
          </div>
        </div>

        <div className="h-4 ticket-edge" />

        <div className="p-6">
          <h2 className="text-2xl font-bold mb-2 font-display">{winner.title}</h2>
          <div className="flex items-center gap-3 text-cream-dim text-sm mb-3">
            <span>{winner.year}</span>
            {full?.runtime && <span>{full.runtime} min</span>}
            {winner.rating && <span className="text-danger">&#9733; {winner.rating.toFixed(1)}</span>}
          </div>
          {full?.director && (
            <p className="text-cream-dim text-sm mb-3">Directed by {full.director}</p>
          )}

          {loading && !full && (
            <p className="text-cream-dim text-xs animate-pulse">Loading details…</p>
          )}

          {streaming.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {streaming.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 glass rounded-lg px-2 py-1">
                  <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded" />
                  <span className="text-xs text-cream-dim">{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <button
          onClick={onAdd}
          disabled={added}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 ${
            added
              ? 'bg-success/20 text-success'
              : 'bg-coral text-charcoal hover:bg-coral-dark'
          }`}
        >
          {added ? 'Added to watchlist' : 'Add to watchlist'}
        </button>
        <button
          onClick={onPickAgain}
          className="w-full py-3 glass rounded-xl text-cream-dim text-sm hover:text-cream transition-colors"
        >
          Pick again
        </button>
        <button
          onClick={onBack}
          className="w-full py-2.5 text-cream-dim/70 text-xs hover:text-cream transition-colors"
        >
          Back to shortlist
        </button>
      </div>
    </motion.div>
  );
}
