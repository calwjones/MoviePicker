'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { sessionApi, swipeApi } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import MoviePoster from '@/components/MoviePoster';
import StarRating from '@/components/StarRating';
import type { HistorySession } from '@shared/types';

interface HistoryTabProps {
  addToast: (message: string) => void;
}

export default function HistoryTab({ addToast }: HistoryTabProps) {
  const router = useRouter();
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
        <div className="flex justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      ) : history.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-cream-dim">No sessions yet. Start swiping to build your history!</p>
        </div>
      ) : (
        history.map((session) => (
          <div key={session.id} className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium">
                  {new Date(session.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-cream-dim text-xs">
                  {session.movieCount} movies swiped · {session.matchCount} matches
                </p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  session.status === 'completed'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-amber/20 text-amber'
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
                    className="flex items-center gap-3 p-2 glass rounded-xl"
                  >
                    <div className="w-10 h-15 rounded-lg overflow-hidden bg-card flex-shrink-0">
                      <MoviePoster posterUrl={match.movie.posterUrl} title={match.movie.title} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{match.movie.title}</p>
                      <p className="text-cream-dim text-xs">{match.movie.year}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {match.watched ? (
                        <>
                          <span className="text-green-400 text-xs">Watched</span>
                          <StarRating
                            value={match.userRating}
                            onChange={(rating) => handleRateMatch(match.id, rating)}
                          />
                        </>
                      ) : (
                        <button
                          onClick={() => handleMarkWatched(match.id)}
                          className="text-amber text-xs hover:underline"
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
                className="w-full mt-3 py-2 glass rounded-xl text-amber text-sm hover:bg-card-hover transition-colors"
              >
                Continue swiping
              </button>
            ) : (
              <button
                onClick={() => router.push(`/matches/${session.id}`)}
                className="w-full mt-3 py-2 glass rounded-xl text-success text-sm hover:bg-card-hover transition-colors"
              >
                View Matches
              </button>
            )}
          </div>
        ))
      )}
    </motion.div>
  );
}
