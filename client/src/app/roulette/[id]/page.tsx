'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { swipeApi } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import StreamingProvidersList from '@/components/StreamingProviders';

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

const SEGMENT_FILLS = ['#1A1A1A', '#222222', '#1E1E1E'];

export default function RoulettePage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuthGuard();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Movie | null>(null);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [spinsLeft, setSpinsLeft] = useState(3);
  const [canvasSize, setCanvasSize] = useState(320);
  const animationRef = useRef<number>(0);
  const rotationRef = useRef(0);
  const matchesRef = useRef<Match[]>([]);

  useEffect(() => { rotationRef.current = rotation; }, [rotation]);
  useEffect(() => { matchesRef.current = matches; }, [matches]);

  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth >= 1024
        ? Math.min(window.innerWidth * 0.35, 500)
        : Math.min(window.innerWidth - 48, 380);
      setCanvasSize(width);
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (!sessionId || !user || authLoading) return;
    swipeApi.matches(sessionId).then((res) => {
      setMatches(res.data.matches);
      setLoading(false);
    }).catch(() => {
      router.push('/dashboard');
    });
  }, [sessionId, user, authLoading, router]);

  useEffect(() => {
    if (!sessionId || loading) return;
    connectSocket();
    const socket = getSocket();
    socket.emit('join-session', sessionId);

    const handleResult = (data: { winnerIndex: number; spinsLeft: number }) => {
      const currentMatches = matchesRef.current;
      const currentRotation = rotationRef.current;
      if (!currentMatches.length) return;

      setSpinsLeft(data.spinsLeft);
      const segmentAngle = (2 * Math.PI) / currentMatches.length;
      const winnerIndex = data.winnerIndex % currentMatches.length;

      const desiredMod = ((-Math.PI / 2 - winnerIndex * segmentAngle - segmentAngle / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const currentMod = ((currentRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      let extra = desiredMod - currentMod;
      if (extra < 0) extra += 2 * Math.PI;
      const totalSpins = 5 + Math.floor(Math.random() * 4);
      const targetRotation = currentRotation + totalSpins * 2 * Math.PI + extra;

      const startRotation = currentRotation;
      const startTime = Date.now();
      const duration = 4000 + Math.random() * 1000;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const r = startRotation + (targetRotation - startRotation) * eased;

        setRotation(r);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setSpinning(false);
          setWinner(currentMatches[winnerIndex].movie);
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    };

    socket.on('roulette-result', handleResult);
    socket.on('connect', () => socket.emit('join-session', sessionId));

    return () => {
      socket.off('roulette-result', handleResult);
      socket.off('connect');
    };
  }, [sessionId, loading]);

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
    const outerRadius = center - 6;
    const innerRadius = outerRadius - 8;
    const segmentAngle = (2 * Math.PI) / matches.length;

    ctx.clearRect(0, 0, size, size);

    const ringGrad = ctx.createLinearGradient(0, 0, size, size);
    ringGrad.addColorStop(0, '#3A3A3A');
    ringGrad.addColorStop(0.3, '#2A2A2A');
    ringGrad.addColorStop(0.5, '#3E3E3E');
    ringGrad.addColorStop(0.7, '#2A2A2A');
    ringGrad.addColorStop(1, '#383838');
    ctx.beginPath();
    ctx.arc(center, center, outerRadius, 0, 2 * Math.PI);
    ctx.fillStyle = ringGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center, center, outerRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    matches.forEach((match, i) => {
      const startAngle = currentRotation + i * segmentAngle;
      const endAngle = startAngle + segmentAngle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, innerRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = SEGMENT_FILLS[i % SEGMENT_FILLS.length];
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(
        center + Math.cos(startAngle) * innerRadius,
        center + Math.sin(startAngle) * innerRadius
      );
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.translate(center, center);

      const midAngle = startAngle + segmentAngle / 2;
      const normalizedAngle = ((midAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const flipped = normalizedAngle > Math.PI / 2 && normalizedAngle < (3 * Math.PI) / 2;

      const maxFontSize = Math.min(13, segmentAngle * innerRadius * 0.35);
      const fontSize = Math.max(7, Math.min(maxFontSize, 110 / matches.length));
      ctx.font = `500 ${fontSize}px "Inter", "DM Sans", system-ui, sans-serif`;

      const maxTextLen = Math.floor((innerRadius - 40) / (fontSize * 0.55));
      const title = match.movie.title.length > maxTextLen
        ? match.movie.title.slice(0, maxTextLen - 1) + '\u2026'
        : match.movie.title;

      if (flipped) {
        ctx.rotate(midAngle + Math.PI);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText(title, -(innerRadius - 18), fontSize / 3 + 1);
        ctx.fillStyle = '#D4CFC7';
        ctx.fillText(title, -(innerRadius - 18), fontSize / 3);
      } else {
        ctx.rotate(midAngle);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText(title, innerRadius - 18, fontSize / 3 + 1);
        ctx.fillStyle = '#D4CFC7';
        ctx.fillText(title, innerRadius - 18, fontSize / 3);
      }
      ctx.restore();
    });

    const innerShadow = ctx.createRadialGradient(center, center, 0, center, center, innerRadius);
    innerShadow.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
    innerShadow.addColorStop(0.15, 'rgba(0, 0, 0, 0.1)');
    innerShadow.addColorStop(0.3, 'transparent');
    ctx.beginPath();
    ctx.arc(center, center, innerRadius, 0, 2 * Math.PI);
    ctx.fillStyle = innerShadow;
    ctx.fill();

    const hubRadius = Math.max(20, center * 0.14);

    ctx.beginPath();
    ctx.arc(center, center, hubRadius + 4, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 107, 107, 0.08)';
    ctx.fill();

    const hubGrad = ctx.createRadialGradient(center, center, 0, center, center, hubRadius);
    hubGrad.addColorStop(0, '#2A2A2A');
    hubGrad.addColorStop(1, '#151515');
    ctx.beginPath();
    ctx.arc(center, center, hubRadius, 0, 2 * Math.PI);
    ctx.fillStyle = hubGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center, center, hubRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const pointerW = 14;
    const pointerH = 22;
    ctx.beginPath();
    ctx.moveTo(center - pointerW, 2);
    ctx.lineTo(center + pointerW, 2);
    ctx.lineTo(center, pointerH + 2);
    ctx.closePath();

    const pGrad = ctx.createLinearGradient(center, 0, center, pointerH + 2);
    pGrad.addColorStop(0, '#FF6B6B');
    pGrad.addColorStop(1, '#E04545');
    ctx.fillStyle = pGrad;
    ctx.fill();

    ctx.shadowColor = 'rgba(255, 107, 107, 0.4)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }, [matches, canvasSize]);

  useEffect(() => {
    drawWheel(rotation);
  }, [matches, rotation, drawWheel, canvasSize]);

  const spin = () => {
    if (spinning || matches.length === 0 || spinsLeft <= 0) return;
    setSpinning(true);
    setWinner(null);
    const socket = getSocket();
    socket.emit('roulette-spin', { sessionId, matchCount: matches.length });
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (matches.length <= 1) {
    router.replace(`/matches/${sessionId}`);
    return null;
  }

  return (
    <div className="min-h-dvh flex flex-col items-center px-6 py-6 lg:py-10">
      {/* Header */}
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-bold mb-1 text-center"
        style={{ fontFamily: 'var(--font-playfair)' }}
      >
        Roulette
      </motion.h1>
      <p className="text-cream-dim text-sm mb-6">
        {spinsLeft} {spinsLeft === 1 ? 'spin' : 'spins'} remaining
      </p>

      {/* Main content — side by side on desktop */}
      <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center lg:items-start lg:justify-center gap-8">
        {/* Wheel with glow */}
        <div className="flex flex-col items-center">
          <div
            className="relative mb-6 rounded-full"
            style={{
              boxShadow: spinning
                ? '0 0 60px rgba(255, 107, 107, 0.15), 0 0 120px rgba(255, 107, 107, 0.05)'
                : '0 0 40px rgba(255, 107, 107, 0.08), 0 0 80px rgba(255, 107, 107, 0.03)',
              transition: 'box-shadow 0.5s ease',
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ width: canvasSize, height: canvasSize }}
              className="rounded-full"
            />
          </div>

          {/* Spin button */}
          {!winner && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={spin}
              disabled={spinning || spinsLeft <= 0}
              className="py-4 px-16 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-all disabled:opacity-40"
              style={{
                boxShadow: spinning ? 'none' : '0 0 20px rgba(255, 107, 107, 0.2)',
              }}
            >
              {spinning ? 'Spinning...' : spinsLeft <= 0 ? 'No spins left' : 'SPIN'}
            </motion.button>
          )}
        </div>

        {/* Winner reveal */}
        <AnimatePresence>
          {winner && (
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', damping: 15, delay: 0.3 }}
              className="w-full max-w-sm lg:max-w-md"
            >
              <div className="glass rounded-3xl overflow-hidden">
                <div className="h-64 lg:h-80 relative">
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
                    <span className="text-charcoal text-xs font-bold">YOUR PICK</span>
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
                    {winner.tmdbRating && <span className="text-danger">&#9733; {winner.tmdbRating.toFixed(1)}</span>}
                  </div>
                  {winner.director && (
                    <p className="text-cream-dim text-sm mb-3">Directed by {winner.director}</p>
                  )}

                  {winner.streamingProviders.length > 0 && (
                    <StreamingProvidersList providers={winner.streamingProviders} />
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
                  onClick={() => router.replace('/dashboard')}
                  className="flex-1 py-3 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors"
                >
                  Done
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
