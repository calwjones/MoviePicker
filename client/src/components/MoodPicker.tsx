'use client';

import { motion, AnimatePresence } from 'framer-motion';

export interface MoodPreset {
  label: string;
  tagline: string;
  genres: string[];
  minRating: number;
  maxRuntime: number;
  decade: string;
}

export const MOOD_PRESETS: readonly MoodPreset[] = [
  { label: 'Cozy',        tagline: 'Warm, low-stakes comfort',  genres: ['Animation', 'Family', 'Comedy'],                     minRating: 0,   maxRuntime: 0,   decade: '' },
  { label: 'Date Night',  tagline: 'Romantic and tight',         genres: ['Romance', 'Drama'],                                  minRating: 0,   maxRuntime: 120, decade: '' },
  { label: 'Funny',       tagline: 'Guaranteed laughs',          genres: ['Comedy'],                                             minRating: 6.5, maxRuntime: 0,   decade: '' },
  { label: 'Intense',     tagline: 'Grip-the-couch energy',      genres: ['Thriller', 'Crime', 'Action'],                       minRating: 7,   maxRuntime: 0,   decade: '' },
  { label: 'Thoughtful',  tagline: 'Something to chew on',       genres: ['Drama', 'Documentary'],                              minRating: 7.5, maxRuntime: 0,   decade: '' },
  { label: 'Adventurous', tagline: 'Big worlds, bigger stakes',  genres: ['Adventure', 'Action', 'Fantasy', 'Science Fiction'], minRating: 0,   maxRuntime: 0,   decade: '' },
] as const;

interface MoodPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (preset: MoodPreset) => void;
  onSkip: () => void;
}

export default function MoodPicker({ open, onClose, onPick, onSkip }: MoodPickerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal/80 backdrop-blur-sm z-40"
            onClick={onClose}
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
                  What&apos;s the vibe?
                </h2>
                <p className="text-cream-dim text-sm">Pick a mood to pre-fill your filters, or skip it.</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {MOOD_PRESETS.map((preset) => (
                  <motion.button
                    key={preset.label}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onPick(preset)}
                    className="glass rounded-2xl p-4 text-left hover:bg-card-hover transition-colors border border-cream/5 hover:border-coral/40"
                  >
                    <div className="text-cream font-semibold text-base mb-0.5">{preset.label}</div>
                    <div className="text-cream-dim text-xs leading-tight">{preset.tagline}</div>
                  </motion.button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onSkip}
                  className="flex-1 py-2.5 glass rounded-xl text-cream-dim text-sm hover:bg-card-hover transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 glass rounded-xl text-cream-dim text-sm hover:bg-card-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
