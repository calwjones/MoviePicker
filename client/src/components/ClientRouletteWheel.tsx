'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SessionMovie } from '@shared/types';

const SEGMENT_FILLS = ['#1A1A1A', '#222222', '#1E1E1E'];

interface ClientRouletteWheelProps {
  movies: SessionMovie[];
  onResult: (sm: SessionMovie) => void;
  maxSpins?: number;
  children?: React.ReactNode;
}

export default function ClientRouletteWheel({
  movies,
  onResult,
  maxSpins = 3,
  children,
}: ClientRouletteWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinsLeft, setSpinsLeft] = useState(maxSpins);
  const [canvasSize, setCanvasSize] = useState(320);
  const [landed, setLanded] = useState<SessionMovie | null>(null);
  const animationRef = useRef<number>(0);
  const rotationRef = useRef(0);

  useEffect(() => { rotationRef.current = rotation; }, [rotation]);

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

  const drawWheel = useCallback((currentRotation: number) => {
    const canvas = canvasRef.current;
    if (!canvas || movies.length === 0) return;

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
    const segmentAngle = (2 * Math.PI) / movies.length;

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
    ctx.strokeStyle = 'rgba(161, 47, 10, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    movies.forEach((sm, i) => {
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
      const fontSize = Math.max(7, Math.min(maxFontSize, 110 / movies.length));
      ctx.font = `500 ${fontSize}px "Inter", "DM Sans", system-ui, sans-serif`;

      const maxTextLen = Math.floor((innerRadius - 40) / (fontSize * 0.55));
      const title = sm.movie.title.length > maxTextLen
        ? sm.movie.title.slice(0, maxTextLen - 1) + '\u2026'
        : sm.movie.title;

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
    ctx.fillStyle = 'rgba(161, 47, 10, 0.08)';
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
    ctx.strokeStyle = 'rgba(161, 47, 10, 0.4)';
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
    pGrad.addColorStop(0, '#A12F0A');
    pGrad.addColorStop(1, '#7A2308');
    ctx.fillStyle = pGrad;
    ctx.fill();

    ctx.shadowColor = 'rgba(161, 47, 10, 0.4)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }, [movies, canvasSize]);

  useEffect(() => {
    drawWheel(rotation);
  }, [movies, rotation, drawWheel, canvasSize]);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const spin = () => {
    if (spinning || movies.length === 0 || spinsLeft <= 0) return;
    setSpinning(true);
    setLanded(null);

    const winnerIndex = Math.floor(Math.random() * movies.length);
    const segmentAngle = (2 * Math.PI) / movies.length;
    const currentRotation = rotationRef.current;

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
        setSpinsLeft((s) => s - 1);
        const result = movies[winnerIndex];
        setLanded(result);
        onResult(result);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const handleRespin = () => {
    setLanded(null);
    setTimeout(spin, 50);
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
      <div
        className="relative mb-6 rounded-full"
        style={{
          boxShadow: spinning
            ? '0 0 60px rgba(161, 47, 10, 0.15), 0 0 120px rgba(161, 47, 10, 0.05)'
            : '0 0 40px rgba(161, 47, 10, 0.08), 0 0 80px rgba(161, 47, 10, 0.03)',
          transition: 'box-shadow 0.5s ease',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: canvasSize, height: canvasSize }}
          className="rounded-full"
        />
      </div>

      <AnimatePresence mode="wait">
        {!landed && (
          <motion.button
            key="spin"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
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
      </AnimatePresence>

      {landed && spinsLeft > 0 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleRespin}
          className="mt-2 py-2 px-6 glass rounded-xl text-cream-dim text-sm font-medium"
        >
          Re-spin
        </motion.button>
      )}

      {children}
    </div>
  );
}
