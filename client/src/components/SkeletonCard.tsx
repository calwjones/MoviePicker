'use client';

import { motion } from 'framer-motion';

export default function SkeletonCard() {
  return (
    <motion.div
      className="glass rounded-2xl overflow-hidden"
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="aspect-[2/3] bg-card-hover" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-card-hover rounded-full w-3/4" />
        <div className="h-2.5 bg-card-hover rounded-full w-1/2" />
      </div>
    </motion.div>
  );
}
