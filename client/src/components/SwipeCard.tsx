'use client';

import { forwardRef, ReactNode, useCallback, useImperativeHandle, useRef } from 'react';
import { animate, AnimatePresence, motion, PanInfo, useMotionValue, useTransform } from 'framer-motion';

export interface SwipeCardHandle {
  swipe: (direction: 'left' | 'right') => Promise<void>;
}

interface SwipeCardProps {
  cardKey: string | number;
  onSwipe: (direction: 'left' | 'right') => void | Promise<void>;
  onTap?: () => void;
  enableHaptics?: boolean;
  className?: string;
  children: ReactNode;
}

const TAP_DISTANCE_THRESHOLD = 10;

const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard(
  { cardKey, onSwipe, onTap, enableHaptics = false, className, children },
  ref,
) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const leftOpacity = useTransform(x, [-120, -60, 0], [1, 0.3, 0]);
  const rightOpacity = useTransform(x, [0, 60, 120], [0, 0.3, 1]);
  const rightScale = useTransform(x, [0, 60, 120], [0.7, 0.85, 1]);
  const leftScale = useTransform(x, [-120, -60, 0], [1, 0.85, 0.7]);

  const cooldownRef = useRef(false);
  const isDragging = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const triggerSwipe = useCallback(async (direction: 'left' | 'right') => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    await animate(x, direction === 'right' ? 400 : -400, { duration: 0.25, ease: 'easeIn' });
    try {
      await onSwipe(direction);
    } finally {
      x.set(0);
      setTimeout(() => { cooldownRef.current = false; }, 100);
    }
  }, [onSwipe, x]);

  useImperativeHandle(ref, () => ({ swipe: triggerSwipe }), [triggerSwipe]);

  const handleDragStart = () => {
    isDragging.current = true;
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setTimeout(() => { isDragging.current = false; }, 50);
    const threshold = 100;
    if (info.offset.x > threshold) {
      if (enableHaptics) {
        try { navigator?.vibrate?.(50); } catch { /* unsupported */ }
      }
      triggerSwipe('right');
    } else if (info.offset.x < -threshold) {
      if (enableHaptics) {
        try { navigator?.vibrate?.(50); } catch { /* unsupported */ }
      }
      triggerSwipe('left');
    } else {
      x.set(0);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || !onTap) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance < TAP_DISTANCE_THRESHOLD && !isDragging.current) {
      onTap();
    }
  };

  const mergedClassName = className ? `swipe-card ${className}` : 'swipe-card';

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={cardKey}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
        style={{ x, rotate, zIndex: 10 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.8}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        className={mergedClassName}
      >
        {children}
        <motion.div
          style={{ opacity: rightOpacity, scale: rightScale, rotate: -12 }}
          className="absolute top-8 left-6 z-20 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-coral bg-charcoal/60 backdrop-blur-sm"
        >
          <svg className="w-7 h-7 text-coral" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.5 0.5c0.3 2.5-0.8 4.2-2.1 5.6C10.1 7.4 8.5 8.8 8.5 11.2c0 2 1.2 3.6 3 3.8-0.9-0.6-1.4-1.6-1.4-2.6 0-1.7 1.3-3 2.8-4.1 1.8-1.3 2.5-3 2.6-5.3 2.6 1.8 4.5 4.8 4.5 8.3 0 4.8-3.9 8.7-8.7 8.7S3 15.9 3 11.1c0-1.9 0.6-3.7 1.8-5.1-0.1 0.6-0.1 1.2-0.1 1.8 0 2.5 1.5 4.3 3.5 4.3-0.2-0.3-0.3-0.7-0.3-1.1 0-1.3 0.6-2.5 1.8-3.8C11.1 5.9 12.6 4.3 13.5 0.5z" />
          </svg>
          <span className="text-coral text-xl font-bold tracking-wider">STRIKE</span>
        </motion.div>
        <motion.div
          style={{ opacity: leftOpacity, scale: leftScale, rotate: 12 }}
          className="absolute top-8 right-6 z-20 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-cream-dim/60 bg-charcoal/60 backdrop-blur-sm"
        >
          <svg className="w-7 h-7 text-cream-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
          <span className="text-cream-dim text-xl font-bold tracking-wider">PASS</span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

export default SwipeCard;
