'use client';

import { forwardRef, ReactNode, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { animate, AnimatePresence, motion, PanInfo, useIsPresent, useMotionValue, useTransform } from 'framer-motion';

export interface SwipeCardHandle {
  swipe: (direction: 'left' | 'right') => Promise<void>;
}

interface SwipeCardProps {
  cardKey: string | number;
  onSwipe: (direction: 'left' | 'right') => void | Promise<void>;
  onTap?: () => void;
  enableHaptics?: boolean;
  /** Sizing/layout classes for the card slot. */
  className?: string;
  /** Visual classes for the draggable face (rounding, shadow, cursor). */
  faceClassName?: string;
  children: ReactNode;
}

const TAP_DISTANCE_THRESHOLD = 10;
const DISTANCE_THRESHOLD = 110;
// A quick flick counts even if it didn't travel far.
const FLICK_VELOCITY = 600;
const FLICK_MIN_DISTANCE = 30;

// Matches the fanned "next card" pose in SwipeView, so a new card appears to
// come forward from the deck rather than fading in from nowhere.
const DECK_POSE = { x: '8%', y: '2%', rotate: 6, scale: 0.92 };

function haptic(ms = 12) {
  try { navigator?.vibrate?.(ms); } catch { /* unsupported */ }
}

const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard(
  { cardKey, className, ...faceProps },
  ref,
) {
  // Only the card on top of the deck answers imperative swipes (keys, buttons).
  const activeFaceRef = useRef<SwipeCardHandle | null>(null);
  useImperativeHandle(ref, () => ({
    swipe: (direction) => activeFaceRef.current?.swipe(direction) ?? Promise.resolve(),
  }), []);

  return (
    <div className={className}>
      <AnimatePresence initial={false}>
        <CardFace key={cardKey} activeFaceRef={activeFaceRef} {...faceProps} />
      </AnimatePresence>
    </div>
  );
});

interface CardFaceProps extends Omit<SwipeCardProps, 'cardKey' | 'className'> {
  activeFaceRef: React.MutableRefObject<SwipeCardHandle | null>;
}

function CardFace({ onSwipe, onTap, enableHaptics = false, faceClassName, children, activeFaceRef }: CardFaceProps) {
  // Each card owns its motion values, so the outgoing card keeps flying while the
  // next one settles. A shared value made the old card flash back to centre.
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const likeOpacity = useTransform(x, [0, 50, 110], [0, 0.4, 1]);
  const passOpacity = useTransform(x, [-110, -50, 0], [1, 0.4, 0]);
  const likeScale = useTransform(x, [0, 110], [0.7, 1]);
  const passScale = useTransform(x, [-110, 0], [1, 0.7]);

  const isPresent = useIsPresent();
  const presentRef = useRef(isPresent);
  useEffect(() => { presentRef.current = isPresent; }, [isPresent]);
  const leaving = useRef(false);
  const dragged = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  // Recent pointer samples, timed by the events themselves, for flick speed.
  const samples = useRef<{ x: number; t: number }[]>([]);

  const swipe = useCallback(async (direction: 'left' | 'right', velocity = 0) => {
    if (leaving.current || !presentRef.current) return;
    leaving.current = true;
    if (enableHaptics) haptic();

    const sign = direction === 'right' ? 1 : -1;
    const target = sign * Math.max(window.innerWidth, 700);
    const remaining = Math.abs(target - x.get());
    // Carry the finger's momentum: faster flicks leave faster.
    const speed = Math.max(Math.abs(velocity), 1600);
    const duration = Math.min(0.34, Math.max(0.18, remaining / speed));
    const flight = animate(x, target, { duration, ease: [0.25, 0.6, 0.4, 1] });

    await onSwipe(direction);
    await flight;
    // If the parent didn't advance (e.g. the swipe was rejected), come back.
    if (presentRef.current) {
      leaving.current = false;
      animate(x, 0, { type: 'spring', stiffness: 420, damping: 32 });
    }
  }, [enableHaptics, onSwipe, x]);

  useEffect(() => {
    if (!isPresent) return;
    const handle: SwipeCardHandle = { swipe: (d) => swipe(d) };
    activeFaceRef.current = handle;
    return () => {
      if (activeFaceRef.current === handle) activeFaceRef.current = null;
    };
  }, [isPresent, swipe, activeFaceRef]);

  const releaseVelocity = (frameSampled: number): number => {
    const pts = samples.current;
    samples.current = [];
    if (pts.length < 2) return frameSampled;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const dt = (last.t - first.t) / 1000;
    const measured = dt > 0 ? (last.x - first.x) / dt : 0;
    // Framer samples on animation frames, which can under-read short flicks.
    return Math.abs(measured) > Math.abs(frameSampled) ? measured : frameSampled;
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setTimeout(() => { dragged.current = false; }, 50);
    const { offset } = info;
    const vx = releaseVelocity(info.velocity.x);
    const flick = Math.abs(vx) > FLICK_VELOCITY && Math.abs(offset.x) > FLICK_MIN_DISTANCE;
    if (offset.x > DISTANCE_THRESHOLD || (flick && vx > 0)) {
      void swipe('right', vx);
    } else if (offset.x < -DISTANCE_THRESHOLD || (flick && vx < 0)) {
      void swipe('left', vx);
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30, velocity: vx });
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    samples.current = [{ x: e.clientX, t: e.timeStamp }];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current) return;
    const pts = samples.current;
    pts.push({ x: e.clientX, t: e.timeStamp });
    // Keep only the last ~100ms: that's the motion at release.
    while (pts.length > 2 && e.timeStamp - pts[0].t > 100) pts.shift();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || !onTap || leaving.current) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < TAP_DISTANCE_THRESHOLD && !dragged.current) {
      onTap();
    }
  };

  return (
    <motion.div
      initial={DECK_POSE}
      animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }}
      style={{ transformOrigin: 'bottom center', zIndex: isPresent ? 10 : 11 }}
      className="absolute inset-0"
    >
      <motion.div
        style={{ x, rotate }}
        drag={isPresent ? 'x' : false}
        dragMomentum={false}
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={handleDragEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`swipe-card absolute inset-0 ${isPresent ? '' : 'pointer-events-none'} ${faceClassName ?? ''}`}
      >
        {children}
        <motion.div
          style={{ opacity: likeOpacity, scale: likeScale, rotate: -12 }}
          className="absolute top-8 left-6 z-20 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-coral bg-charcoal/60 backdrop-blur-sm"
        >
          <svg className="w-7 h-7 text-coral" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.5 0.5c0.3 2.5-0.8 4.2-2.1 5.6C10.1 7.4 8.5 8.8 8.5 11.2c0 2 1.2 3.6 3 3.8-0.9-0.6-1.4-1.6-1.4-2.6 0-1.7 1.3-3 2.8-4.1 1.8-1.3 2.5-3 2.6-5.3 2.6 1.8 4.5 4.8 4.5 8.3 0 4.8-3.9 8.7-8.7 8.7S3 15.9 3 11.1c0-1.9 0.6-3.7 1.8-5.1-0.1 0.6-0.1 1.2-0.1 1.8 0 2.5 1.5 4.3 3.5 4.3-0.2-0.3-0.3-0.7-0.3-1.1 0-1.3 0.6-2.5 1.8-3.8C11.1 5.9 12.6 4.3 13.5 0.5z" />
          </svg>
          <span className="text-coral text-xl font-bold tracking-wider">STRIKE</span>
        </motion.div>
        <motion.div
          style={{ opacity: passOpacity, scale: passScale, rotate: 12 }}
          className="absolute top-8 right-6 z-20 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-cream-dim/60 bg-charcoal/60 backdrop-blur-sm"
        >
          <svg className="w-7 h-7 text-cream-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
          <span className="text-cream-dim text-xl font-bold tracking-wider">PASS</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default SwipeCard;
