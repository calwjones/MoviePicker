'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

const COLORS = ['#F5A623', '#FF6B6B', '#4ADE80', '#60A5FA', '#A78BFA', '#F472B6', '#FBBF24', '#34D399'];

export default function RoulettePage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Movie | null>(null);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [spinsLeft, setSpinsLeft] = useState(3);
  const [canvasSize, setCanvasSize] = useState(300);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!user) {
      router.push('/auth?mode=login');
    }
  }, [user, router]);

  useEffect(() => {
    const updateSize = () => {
      const width = Math.min(window.innerWidth - 48, 360);
      setCanvasSize(width);
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (!sessionId || !user) return;
    swipeApi.matches(sessionId).then((res) => {
      setMatches(res.data.matches);
      const stored = sessionStorage.getItem(`spins-${sessionId}`);
      if (stored !== null) {
        setSpinsLeft(parseInt(stored));
      }
      setLoading(false);
    }).catch(() => {
      router.push('/dashboard');
    });
  }, [sessionId, user, router]);

  useEffect(() => {
    if (sessionId && !loading) {
      sessionStorage.setItem(`spins-${sessionId}`, spinsLeft.toString());
    }
  }, [spinsLeft, sessionId, loading]);

  const drawWheel = useCallback((currentRotation: number) => {
    const canvas = canvasRef.current;
    if (!canvas || matches.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    ctx.scale(dpr, dpr);

    const size = canvasSize;
    const center = size / 2;
    const radius = center - 10;
    const segmentAngle = (2 * Math.PI) / matches.length;

    ctx.clearRect(0, 0, size, size);

    matches.forEach((match, i) => {
      const startAngle = currentRotation + i * segmentAngle;
      const endAngle = startAngle + segmentAngle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();

      ctx.strokeStyle = '#0D0D0D';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startAngle + segmentAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0D0D0D';

      const maxFontSize = Math.min(14, (segmentAngle * radius * 0.4));
      const fontSize = Math.max(8, Math.min(maxFontSize, 120 / matches.length));
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;

      const maxTextLen = Math.floor(radius / (fontSize * 0.6));
      const title = match.movie.title.length > maxTextLen
        ? match.movie.title.slice(0, maxTextLen - 1) + '...'
        : match.movie.title;
      ctx.fillText(title, radius - 20, fontSize / 3);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(center, center, 25, 0, 2 * Math.PI);
    ctx.fillStyle = '#0D0D0D';
    ctx.fill();
    ctx.strokeStyle = '#F5A623';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(center - 12, 6);
    ctx.lineTo(center + 12, 6);
    ctx.lineTo(center, 28);
    ctx.closePath();
    ctx.fillStyle = '#F5A623';
    ctx.fill();
  }, [matches, canvasSize]);

  useEffect(() => {
    drawWheel(rotation);
  }, [matches, rotation, drawWheel, canvasSize]);

  const spin = () => {
    if (spinning || matches.length === 0 || spinsLeft <= 0) return;

    setSpinning(true);
    setWinner(null);
    setSpinsLeft((prev) => prev - 1);

    const segmentAngle = (2 * Math.PI) / matches.length;
    const winnerIndex = Math.floor(Math.random() * matches.length);
    const targetSegmentCenter = winnerIndex * segmentAngle + segmentAngle / 2;
    const pointerAngle = -Math.PI / 2;
    const baseRotation = pointerAngle - targetSegmentCenter;
    const totalSpins = 5 + Math.random() * 3;
    const targetRotation = rotation + totalSpins * 2 * Math.PI + (baseRotation - rotation % (2 * Math.PI));

    const startRotation = rotation;
    const startTime = Date.now();
    const duration = 4000 + Math.random() * 1000;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const eased = 1 - Math.pow(1 - progress, 3);
      const currentRotation = startRotation + (targetRotation - startRotation) * eased;

      setRotation(currentRotation);
      drawWheel(currentRotation);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        setWinner(matches[winnerIndex].movie);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-amber border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (matches.length <= 1) {
    router.push(`/matches/${sessionId}`);
    return null;
  }

  return (
    <div className="min-h-dvh flex flex-col items-center px-6 py-8">
      <h1
        className="text-3xl font-bold mb-2 text-center"
        style={{ fontFamily: 'var(--font-playfair)' }}
      >
        The <span className="text-coral">Roulette</span>
      </h1>
      <p className="text-cream-dim text-sm mb-6">
        {spinsLeft} {spinsLeft === 1 ? 'spin' : 'spins'} remaining
      </p>

      {/* Wheel */}
      <div ref={containerRef} className="relative roulette-glow rounded-full mb-8">
        <canvas
          ref={canvasRef}
          style={{ width: canvasSize, height: canvasSize }}
          className="rounded-full"
        />
      </div>

      {/* Spin button */}
      {!winner && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={spin}
          disabled={spinning || spinsLeft <= 0}
          className="py-4 px-16 bg-coral text-charcoal font-bold rounded-xl text-xl hover:bg-coral-dark transition-colors disabled:opacity-50 mb-8"
        >
          {spinning ? 'Spinning...' : spinsLeft <= 0 ? 'No spins left' : 'SPIN'}
        </motion.button>
      )}

      {/* Winner reveal */}
      <AnimatePresence>
        {winner && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 15, delay: 0.3 }}
            className="w-full max-w-sm"
          >
            {/* Movie ticket */}
            <div className="glass rounded-3xl overflow-hidden">
              <div className="h-64 relative">
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
                <h2
                  className="text-2xl font-bold mb-2"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  {winner.title}
                </h2>
                <div className="flex items-center gap-3 text-cream-dim text-sm mb-3">
                  <span>{winner.year}</span>
                  {winner.runtime && <span>{winner.runtime} min</span>}
                  {winner.tmdbRating && <span className="text-amber">&#9733; {winner.tmdbRating.toFixed(1)}</span>}
                </div>
                {winner.director && (
                  <p className="text-cream-dim text-sm">Directed by {winner.director}</p>
                )}

                {winner.streamingProviders.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {winner.streamingProviders.filter((p) => p.type === 'stream').map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5 glass rounded-lg px-2 py-1">
                        <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded" />
                        <span className="text-xs text-cream-dim">{p.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              {spinsLeft > 0 && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setWinner(null)}
                  className="flex-1 py-3 glass rounded-xl text-cream-dim font-medium"
                >
                  Re-spin
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/dashboard')}
                className="flex-1 py-3 bg-amber text-charcoal font-semibold rounded-xl hover:bg-amber-dark transition-colors"
              >
                Done
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
