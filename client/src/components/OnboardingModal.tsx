'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onPickPath: (path: 'together' | 'solo' | 'discover') => void;
}

const PATHS = [
  {
    id: 'together' as const,
    title: 'Watch with someone',
    description: 'Create a group, share a link, swipe in sync until you both hit yes.',
  },
  {
    id: 'solo' as const,
    title: 'Pick for myself',
    description: 'Solo swipe through your library, land on a pick without any debate.',
  },
  {
    id: 'discover' as const,
    title: 'Find something for today',
    description: 'Start with filters, discover new movies, build a shortlist in minutes.',
  },
];

export default function OnboardingModal({ open, onClose, onPickPath }: OnboardingModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal/85 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none"
          >
            <div className="glass rounded-3xl p-6 w-full max-w-md space-y-5 pointer-events-auto max-h-[90vh] overflow-y-auto">
              <div className="text-center">
                <h2
                  className="text-2xl font-bold text-cream mb-1"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  Welcome to Matchsticked
                </h2>
                <p className="text-cream-dim text-sm">Pick a path to get started. You can always do the others later.</p>
              </div>

              <div className="space-y-2.5">
                {PATHS.map((path) => (
                  <motion.button
                    key={path.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onPickPath(path.id)}
                    className="w-full text-left glass rounded-2xl p-4 hover:bg-card-hover transition-colors border border-cream/5 hover:border-coral/40"
                  >
                    <div className="text-cream font-semibold text-base mb-1">{path.title}</div>
                    <div className="text-cream-dim text-xs leading-snug">{path.description}</div>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={onClose}
                className="w-full py-2.5 text-cream-dim text-sm hover:text-cream transition-colors"
              >
                Skip for now
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
