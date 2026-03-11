'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { swipeApi } from '@/lib/api';
import type { Movie, StreamingProvider } from '@shared/types';
import SkeletonList from '@/components/SkeletonList';

interface Match {
  id: string;
  movieId: string;
  movie: Movie;
}

interface Compromise {
  id: string;
  movieId: string;
  movie: Movie;
}

export default function MatchesPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [compromises, setCompromises] = useState<Compromise[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear reveal timers on unmount
  useEffect(() => {
    return () => {
      revealTimers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      router.push('/auth?mode=login');
    }
  }, [user, router]);

  useEffect(() => {
    if (!sessionId || !user) return;
    swipeApi.matches(sessionId).then((res) => {
      setMatches(res.data.matches);
      setCompromises(res.data.compromises || []);
      setLoading(false);
    }).catch(() => {
      router.replace('/dashboard');
    });
  }, [sessionId, user, router]);

  const startReveal = () => {
    setRevealed(true);
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = matches.map((_, i) =>
      setTimeout(() => setRevealIndex(i), (i + 1) * 350)
    );
  };

  const revealAll = () => {
    revealTimers.current.forEach(clearTimeout);
    setRevealIndex(matches.length - 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh px-6">
        <div className="w-full max-w-sm">
          <SkeletonList count={4} />
        </div>
      </div>
    );
  }

  // No matches — show compromises if available
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm"
        >
          <h2
            className="text-3xl font-bold mb-4"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            No exact matches
          </h2>

          {compromises.length > 0 ? (
            <>
              <p className="text-cream-dim mb-6">
                No overlap this time — but here are your best compromises:
              </p>
              <div className="space-y-3 mb-8">
                {compromises.map((c) => (
                  <div key={c.id} className="glass rounded-2xl p-4 flex gap-4 items-center text-left">
                    {c.movie.posterUrl && (
                      <div
                        className="w-12 h-16 rounded-lg bg-cover bg-center flex-shrink-0 opacity-70"
                        style={{ backgroundImage: `url(${c.movie.posterUrl})` }}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.movie.title}</p>
                      <div className="flex items-center gap-2 text-cream-dim text-xs mt-0.5">
                        <span>{c.movie.year}</span>
                        {c.movie.tmdbRating && (
                          <span className="text-danger/70">&#9733; {c.movie.tmdbRating.toFixed(1)}</span>
                        )}
                        <span className="px-1.5 py-0.5 rounded-full border border-cream-dim/30 text-cream-dim/60">
                          Almost
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-cream-dim mb-8">
              Try adjusting your filters or adding more movies to your watchlists.
            </p>
          )}

          <button
            onClick={() => router.replace('/dashboard')}
            className="py-3 px-8 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors"
          >
            Back to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  // Single match — show it directly as the pick
  if (matches.length === 1) {
    const movie = matches[0].movie;

    if (!revealed) {
      return (
        <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2
              className="text-3xl font-bold mb-2"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              Swiping complete!
            </h2>
            <p className="text-cream-dim text-lg mb-8">
              You have <span className="text-danger font-bold">1</span> match
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setRevealed(true)}
              className="py-4 px-12 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors"
            >
              Reveal Your Pick
            </motion.button>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6">
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
                <span className="text-charcoal text-xs font-bold">YOUR PICK</span>
              </div>
            </div>

            <div className="h-4 ticket-edge" />

            <div className="p-6">
              <h2
                className="text-2xl font-bold mb-2"
                style={{ fontFamily: 'var(--font-playfair)' }}
              >
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

              {(movie.streamingProviders as StreamingProvider[]).filter((p) => p.type === 'stream').length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {(movie.streamingProviders as StreamingProvider[]).filter((p) => p.type === 'stream').map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5 glass rounded-lg px-2 py-1">
                      <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded" />
                      <span className="text-xs text-cream-dim">{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => router.replace('/dashboard')}
            className="w-full mt-6 py-3 glass rounded-xl text-cream-dim font-medium"
          >
            Back to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  // Pre-reveal state (multiple matches)
  if (!revealed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2
            className="text-3xl font-bold mb-2"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Swiping complete!
          </h2>
          <p className="text-cream-dim text-lg mb-8">
            You have{' '}
            <span className="text-danger font-bold">{matches.length}</span>{' '}
            matches
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startReveal}
            className="py-4 px-12 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors"
          >
            Reveal Matches
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // Multiple matches — reveal grid then go to roulette
  return (
    <div className="min-h-dvh px-6 py-8 flex flex-col items-center justify-center">
      <h2
        className="text-2xl font-bold mb-8 text-center"
        style={{ fontFamily: 'var(--font-playfair)' }}
      >
        Your Matches
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-sm lg:max-w-2xl mb-8">
        <AnimatePresence>
          {matches.map((match, i) => (
            <motion.div
              key={match.id}
              initial={{ opacity: 0, scale: 0.5, rotateY: 180 }}
              animate={i <= revealIndex ? {
                opacity: 1,
                scale: 1,
                rotateY: 0,
              } : {
                opacity: 0.2,
                scale: 0.9,
              }}
              transition={{
                type: 'spring',
                damping: 12,
                stiffness: 200,
              }}
              className="glass rounded-2xl overflow-hidden"
            >
              <div className="aspect-[2/3] relative">
                {match.movie.posterUrl ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${match.movie.posterUrl})` }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-card flex items-center justify-center p-2">
                    <span className="text-cream-dim text-xs text-center">{match.movie.title}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                <div className="absolute bottom-2 left-2 right-2">
                  <p className="text-sm font-semibold truncate">{match.movie.title}</p>
                  <p className="text-xs text-cream-dim">{match.movie.year}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {revealed && revealIndex < matches.length - 1 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={revealAll}
          className="mb-4 py-2 px-6 glass rounded-xl text-cream-dim text-sm font-medium hover:bg-card-hover transition-colors"
        >
          Reveal All
        </motion.button>
      )}

      {revealIndex >= matches.length - 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 w-full max-w-sm lg:max-w-md"
        >
          {matches.length >= 2 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.replace(`/roulette/${sessionId}`)}
              className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors"
            >
              Spin the Roulette
            </motion.button>
          )}
          <button
            onClick={() => router.replace('/dashboard')}
            className="w-full py-3 glass rounded-xl text-cream-dim font-medium"
          >
            Back to Dashboard
          </button>
        </motion.div>
      )}
    </div>
  );
}
