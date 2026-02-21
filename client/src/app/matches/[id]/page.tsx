'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { swipeApi } from '@/lib/api';

interface Movie {
  id: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  genres: string[];
  director: string | null;
  runtime: number | null;
  tmdbRating: number | null;
  streamingProviders: { name: string; type: string; logoUrl: string }[];
}

interface Match {
  id: string;
  movieId: string;
  movie: Movie;
}

export default function MatchesPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/auth?mode=login');
    }
  }, [user, router]);

  useEffect(() => {
    if (!sessionId || !user) return;
    swipeApi.matches(sessionId).then((res) => {
      setMatches(res.data.matches);
      setLoading(false);
    }).catch(() => {
      router.push('/dashboard');
    });
  }, [sessionId, user, router]);

  const startReveal = () => {
    setRevealed(true);
    matches.forEach((_, i) => {
      setTimeout(() => setRevealIndex(i), (i + 1) * 800);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-amber border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No matches
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <h2
            className="text-3xl font-bold mb-4"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            No matches this time
          </h2>
          <p className="text-cream-dim mb-8">
            Try adjusting your filters or adding more movies to your watchlists.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="py-3 px-8 bg-amber text-charcoal font-semibold rounded-xl hover:bg-amber-dark transition-colors"
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
              You have <span className="text-amber font-bold">1</span> match
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setRevealed(true)}
              className="py-4 px-12 bg-amber text-charcoal font-bold rounded-xl text-lg hover:bg-amber-dark transition-colors"
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
            <div className="h-80 relative">
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
              <div className="absolute top-4 left-4 px-3 py-1 bg-amber rounded-full">
                <span className="text-charcoal text-xs font-bold">TONIGHT&apos;S PICK</span>
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
                {movie.tmdbRating && <span className="text-amber">&#9733; {movie.tmdbRating.toFixed(1)}</span>}
              </div>
              {movie.director && (
                <p className="text-cream-dim text-sm mb-3">Directed by {movie.director}</p>
              )}

              {movie.streamingProviders.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {movie.streamingProviders.filter((p) => p.type === 'stream').map((p, i) => (
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
            onClick={() => router.push('/dashboard')}
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
            <span className="text-amber font-bold">{matches.length}</span>{' '}
            matches
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startReveal}
            className="py-4 px-12 bg-amber text-charcoal font-bold rounded-xl text-lg hover:bg-amber-dark transition-colors"
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

      <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
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

      {revealIndex >= matches.length - 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 w-full max-w-sm"
        >
          {matches.length >= 2 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push(`/roulette/${sessionId}`)}
              className="w-full py-4 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors"
            >
              Spin the Roulette
            </motion.button>
          )}
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 glass rounded-xl text-cream-dim font-medium"
          >
            Back to Dashboard
          </button>
        </motion.div>
      )}
    </div>
  );
}
