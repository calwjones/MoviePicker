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
  const leftOpacity = useTransform(x, [-200, -50, 0], [1, 0.5, 0]);
  const rightOpacity = useTransform(x, [0, 50, 200], [0, 0.5, 1]);

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
        animate={{ opacity: 1, scale: 1, y: 0, x: 0, rotate: 0 }}
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
          style={{ opacity: rightOpacity }}
          className="absolute top-8 left-6 z-20 px-4 py-2 border-3 border-success rounded-xl pointer-events-none"
        >
          <span className="text-success text-2xl font-bold">YES</span>
        </motion.div>
        <motion.div
          style={{ opacity: leftOpacity }}
          className="absolute top-8 right-6 z-20 px-4 py-2 border-3 border-danger rounded-xl pointer-events-none"
        >
          <span className="text-danger text-2xl font-bold">NOPE</span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

export default SwipeCard;
