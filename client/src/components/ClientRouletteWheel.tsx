'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { SessionMovie } from '@matchsticked/shared';
import { getSocket } from '@/lib/socket';
import MoviePoster from '@/components/MoviePoster';

const TILE_WIDTH = 132;
const TILE_GAP = 12;
const TILE_STEP = TILE_WIDTH + TILE_GAP;
const LOOPS = 10;
const SPIN_DURATION_MS = 4500;

interface ClientRouletteWheelProps {
  movies: SessionMovie[];
  onResult: (sm: SessionMovie) => void;
  maxSpins?: number;
  children?: React.ReactNode;
  sessionId?: string;
  spinsLeft?: number;
  onSpinsLeftChange?: (n: number) => void;
}

export default function ClientRouletteWheel({
  movies,
  onResult,
  maxSpins = 3,
  children,
  sessionId,
  spinsLeft: spinsLeftProp,
  onSpinsLeftChange,
}: ClientRouletteWheelProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [internalSpinsLeft, setInternalSpinsLeft] = useState(maxSpins);
  const [hasLanded, setHasLanded] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [trackX, setTrackX] = useState(0);

  const controlledSpins = typeof spinsLeftProp === 'number';
  const spinsLeft = controlledSpins ? (spinsLeftProp as number) : internalSpinsLeft;
  const setSpinsLeft = useCallback((n: number) => {
    if (!controlledSpins) setInternalSpinsLeft(n);
    onSpinsLeftChange?.(n);
  }, [controlledSpins, onSpinsLeftChange]);

  const tiles = useMemo(() => {
    const out: { sm: SessionMovie; key: string; loopIndex: number; originalIndex: number }[] = [];
    for (let loop = 0; loop < LOOPS; loop++) {
      movies.forEach((sm, idx) => {
        out.push({ sm, key: `${loop}-${idx}`, loopIndex: loop, originalIndex: idx });
      });
    }
    return out;
  }, [movies]);

  const runSpinAnimation = useCallback((winner: number) => {
    if (winner < 0 || winner >= movies.length) return;
    const track = trackRef.current;
    if (!track) return;

    setSpinning(true);
    setHasLanded(false);
    setWinnerIndex(null);

    const viewportWidth = track.parentElement?.clientWidth ?? window.innerWidth;
    const centerOffset = viewportWidth / 2 - TILE_WIDTH / 2;

    const landingLoop = LOOPS - 2;
    const tileIndexInTrack = landingLoop * movies.length + winner;
    const targetX = centerOffset - tileIndexInTrack * TILE_STEP;

    setTrackX(0);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTrackX(targetX);
      });
    });

    window.setTimeout(() => {
      setSpinning(false);
      setHasLanded(true);
      setWinnerIndex(winner);
      onResult(movies[winner]);
    }, SPIN_DURATION_MS + 50);
  }, [movies, onResult]);

  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();
    const handleResult = (data: { winnerIndex: number; spinsLeft: number }) => {
      setSpinsLeft(data.spinsLeft);
      runSpinAnimation(data.winnerIndex);
    };
    const handleState = (data: { spinsLeft: number }) => {
      setSpinsLeft(data.spinsLeft);
    };
    const handleError = (data?: { spinsLeft?: number }) => {
      setSpinning(false);
      if (typeof data?.spinsLeft === 'number') setSpinsLeft(data.spinsLeft);
    };
    socket.on('roulette-result', handleResult);
    socket.on('roulette-state', handleState);
    socket.on('roulette-error', handleError);
    return () => {
      socket.off('roulette-result', handleResult);
      socket.off('roulette-state', handleState);
      socket.off('roulette-error', handleError);
    };
  }, [sessionId, runSpinAnimation, setSpinsLeft]);

  const spin = () => {
    if (spinning || movies.length === 0 || spinsLeft <= 0) return;

    if (sessionId) {
      const socket = getSocket();
      if (socket.connected) {
        setSpinning(true);
        socket.emit('roulette-spin', { sessionId, matchCount: movies.length });
        return;
      }
    }

    const winner = Math.floor(Math.random() * movies.length);
    setSpinsLeft(Math.max(0, spinsLeft - 1));
    runSpinAnimation(winner);
  };

  return (
    <div className="w-full flex flex-col items-center px-2 py-4 lg:py-8">
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

      <div className="relative w-full max-w-2xl lg:max-w-3xl mb-6">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 z-10 bg-gradient-to-r from-charcoal to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 z-10 bg-gradient-to-l from-charcoal to-transparent" />

        {/* center indicator */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
          <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-coral" />
          <div className="flex-1 w-[2px] bg-coral/40" />
          <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-b-[10px] border-l-transparent border-r-transparent border-b-coral" />
        </div>

        <div className="overflow-hidden py-4">
          <div
            ref={trackRef}
            className="flex"
            style={{
              gap: `${TILE_GAP}px`,
              transform: `translateX(${trackX}px)`,
              transition: spinning
                ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.15, 0.95, 0.25, 1)`
                : 'none',
              willChange: 'transform',
            }}
          >
            {tiles.map((t) => {
              const isWinner =
                hasLanded && winnerIndex !== null && t.originalIndex === winnerIndex && t.loopIndex === LOOPS - 2;
              return (
                <div
                  key={t.key}
                  className={`shrink-0 aspect-[2/3] rounded-xl overflow-hidden relative ${
                    isWinner ? 'ring-2 ring-coral shadow-[0_0_30px_rgba(161,47,10,0.6)]' : ''
                  }`}
                  style={{ width: TILE_WIDTH }}
                >
                  <MoviePoster posterUrl={t.sm.movie.posterUrl} title={t.sm.movie.title} />
                  {!isWinner && <div className="absolute inset-0 bg-charcoal/30" />}
                </div>
              );
            })}
          </div>
        </div>

        {hasLanded && winnerIndex !== null && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-cream text-sm font-medium mt-2"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            {movies[winnerIndex].movie.title}
          </motion.p>
        )}
      </div>

      {!hasLanded && (
        <motion.button
          key="spin"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={spin}
          disabled={spinning || spinsLeft <= 0}
          className="py-4 px-16 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-all disabled:opacity-40"
          style={{ boxShadow: spinning ? 'none' : '0 0 20px rgba(161, 47, 10, 0.2)' }}
        >
          {spinning ? 'Spinning…' : spinsLeft <= 0 ? 'No spins left' : 'SPIN'}
        </motion.button>
      )}

      {children}
    </div>
  );
}
