'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { movieApi, sessionApi, swipeApi } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import MoviePoster from '@/components/MoviePoster';
import StarRating from '@/components/StarRating';
import type { HistorySession } from '@matchsticked/shared';

interface HistoryTabProps {
  addToast: (message: string) => void;
}

const SESSIONS_PER_PAGE = 10;

export default function HistoryTab({ addToast }: HistoryTabProps) {
  const router = useRouter();
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(SESSIONS_PER_PAGE);
  const [rewatched, setRewatched] = useState<Set<string>>(new Set());

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await sessionApi.history();
      setHistory(res.data.sessions);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleMarkWatched = async (matchId: string) => {
    try {
      await swipeApi.markWatched(matchId);
      setHistory((prev) =>
        prev.map((s) => ({
          ...s,
          matches: s.matches.map((m) =>
            m.id === matchId ? { ...m, watched: true, watchedAt: new Date().toISOString() } : m
          ),
        }))
      );
    } catch {
      addToast('Failed to mark as watched');
    }
  };

  const handleRewatch = async (matchId: string, tmdbId: number | undefined, title: string) => {
    if (!tmdbId) {
      addToast('Cannot rewatch this movie');
      return;
    }
    if (rewatched.has(matchId)) return;
    try {
      await movieApi.add(tmdbId);
      setRewatched((prev) => new Set(prev).add(matchId));
      addToast(`"${title}" is back on your watchlist`);
    } catch {
      addToast('Failed to add to watchlist');
    }
  };

  const handleRateMatch = async (matchId: string, rating: number) => {
    try {
      await swipeApi.rateMatch(matchId, rating);
      setHistory((prev) =>
        prev.map((s) => ({
          ...s,
          matches: s.matches.map((m) =>
            m.id === matchId ? { ...m, userRating: rating } : m
          ),
        }))
      );
    } catch {
      addToast('Failed to save rating');
    }
  };

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-4"
    >
      <h2 className="text-xl font-semibold font-display">
        Session History
      </h2>

      {historyLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-4 space-y-2 animate-pulse">
              <div className="h-3.5 bg-card-hover rounded-full w-2/5" />
              <div className="h-3 bg-card-hover rounded-full w-1/3" />
            </div>
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-cream-dim">No sessions yet. Start swiping to build your history!</p>
        </div>
      ) : (
        history.slice(0, visibleCount).map((session) => (
          <div key={session.id} className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    {new Date(session.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  <span className="text-xs px-1.5 py-0.5 rounded-full glass text-cream-dim/70 capitalize">
                    {session.type === 'solo' ? 'solo' : session.type === 'guest' ? 'guest' : 'group'}
                  </span>
                </div>
                <p className="text-cream-dim text-xs">
                  {session.movieCount} movies swiped · {session.matchCount} matches
                </p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  session.status === 'completed'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-coral/20 text-danger'
                }`}
              >
                {session.status}
              </span>
            </div>

            {session.matches.length > 0 && (
              <div className="space-y-2">
                {session.matches.map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center gap-3 p-2 glass rounded-xl hover:bg-card-hover transition-all"
                  >
                    <div className="w-10 aspect-[2/3] rounded-lg overflow-hidden bg-card flex-shrink-0 shadow-sm">
                      <MoviePoster posterUrl={match.movie.posterUrl} title={match.movie.title} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{match.movie.title}</p>
                      <p className="text-cream-dim text-xs">{match.movie.year}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {match.watched ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-green-400 text-xs">Watched</span>
                            <button
                              onClick={() => handleRewatch(match.id, match.movie.tmdbId, match.movie.title)}
                              disabled={rewatched.has(match.id)}
                              className="w-5 h-5 rounded-full bg-coral/20 text-coral flex items-center justify-center hover:bg-coral/40 disabled:opacity-50 disabled:cursor-default transition-colors"
                              aria-label="Add back to watchlist"
                              title={rewatched.has(match.id) ? 'Added back' : 'Watch again'}
                            >
                              {rewatched.has(match.id) ? (
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="12" y1="5" x2="12" y2="19" />
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                              )}
                            </button>
                          </div>
                          <StarRating
                            value={match.userRating}
                            onChange={(rating) => handleRateMatch(match.id, rating)}
                          />
                        </>
                      ) : (
                        <button
                          onClick={() => handleMarkWatched(match.id)}
                          className="text-danger text-xs hover:underline"
                        >
                          Mark watched
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {session.status !== 'completed' ? (
              <button
                onClick={() => router.push(`/session/${session.id}`)}
                className="w-full mt-3 py-2 glass rounded-xl text-danger text-sm hover:bg-card-hover transition-all btn-glow shadow-sm"
              >
                Continue swiping
              </button>
            ) : (
              <button
                onClick={() => router.push(`/matches/${session.id}`)}
                className="w-full mt-3 py-2 glass rounded-xl text-success text-sm hover:bg-card-hover transition-all btn-glow shadow-sm"
              >
                View Matches
              </button>
            )}
          </div>
        ))
      )}
      {!historyLoading && history.length > visibleCount && (
        <button
          onClick={() => setVisibleCount((prev) => prev + SESSIONS_PER_PAGE)}
          className="w-full py-2 glass rounded-xl text-cream-dim text-sm hover:bg-card-hover transition-colors"
        >
          Show more ({history.length - visibleCount} remaining)
        </button>
      )}
    </motion.div>
  );
}
