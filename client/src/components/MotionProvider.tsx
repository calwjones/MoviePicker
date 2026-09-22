'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

/** App-wide motion defaults: honour the OS "reduce motion" setting everywhere. */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
