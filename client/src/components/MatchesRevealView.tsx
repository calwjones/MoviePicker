'use client';

import { motion, AnimatePresence } from 'framer-motion';
import MoviePoster from '@/components/MoviePoster';
import InCinemaBadge from '@/components/InCinemaBadge';
import type { Movie } from '@shared/types';

export interface RevealItem {
  id: string;
  movie: Movie;
}

interface MatchesRevealViewProps {
  items: RevealItem[];
  title: string;
  counterLine: string;
  revealCTA: string;
  revealed: boolean;
  revealIndex: number;
  onStartReveal: () => void;
  onRevealAll: () => void;
  postRevealTitle: string;
  renderCardBadge?: (item: RevealItem) => React.ReactNode;
  actions: React.ReactNode;
}

export default function MatchesRevealView({
  items,
  title,
  counterLine,
  revealCTA,
  revealed,
  revealIndex,
  onStartReveal,
  onRevealAll,
  postRevealTitle,
  renderCardBadge,
  actions,
}: MatchesRevealViewProps) {
  const fullyRevealed = revealIndex >= items.length - 1;

  if (!revealed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center"
      >
        <h2
          className="text-3xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-playfair)' }}
        >
          {title}
        </h2>
        <p className="text-cream-dim text-lg mb-8">{counterLine}</p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onStartReveal}
          className="py-4 px-12 bg-coral text-charcoal font-bold rounded-xl text-lg hover:bg-coral-dark transition-colors"
        >
          {revealCTA}
        </motion.button>
      </motion.div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">
      <h2
        className="text-2xl font-bold mb-8 text-center"
        style={{ fontFamily: 'var(--font-playfair)' }}
      >
        {postRevealTitle}
      </h2>

      <div
        className="grid grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-sm lg:max-w-2xl mb-8"
        style={{ perspective: 1000 }}
      >
        <AnimatePresence>
          {items.map((item, i) => {
            const revealedThis = i <= revealIndex;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.5, rotateY: 180 }}
                animate={revealedThis
                  ? { opacity: 1, scale: 1, rotateY: 0 }
                  : { opacity: 0.2, scale: 0.9 }}
                transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                className="glass rounded-2xl overflow-hidden relative"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div className="aspect-[2/3] relative">
                  {item.movie.posterUrl ? (
                    <MoviePoster posterUrl={item.movie.posterUrl} title={item.movie.title} />
                  ) : (
                    <div className="absolute inset-0 bg-card flex items-center justify-center p-2">
                      <span className="text-cream-dim text-xs text-center">{item.movie.title}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                  {item.movie.inCinema && (
                    <div className="absolute top-2 left-2">
                      <InCinemaBadge size="sm" />
                    </div>
                  )}
                  {renderCardBadge && (
                    <div className="absolute top-2 right-2">{renderCardBadge(item)}</div>
                  )}
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-sm font-semibold truncate">{item.movie.title}</p>
                    <p className="text-xs text-cream-dim">{item.movie.year}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {!fullyRevealed && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRevealAll}
          className="mb-4 py-2 px-6 glass rounded-xl text-cream-dim text-sm font-medium hover:bg-card-hover transition-colors"
        >
          Reveal All
        </motion.button>
      )}

      {fullyRevealed && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 w-full max-w-sm lg:max-w-md"
        >
          {actions}
        </motion.div>
      )}
    </div>
  );
}
