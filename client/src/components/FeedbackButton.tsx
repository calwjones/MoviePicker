'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { feedbackApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';

const MAX_LEN = 2000;

interface FeedbackButtonProps {
  addToast: (message: string, opts?: { variant?: 'success' | 'error' | 'info'; duration?: number }) => void;
}

export default function FeedbackButton({ addToast }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setBody('');
  };

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const page = typeof window !== 'undefined' ? window.location.pathname : undefined;
      await feedbackApi.submit(trimmed, page);
      addToast('Thanks — feedback received', { variant: 'success' });
      setOpen(false);
      setBody('');
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to send feedback'), { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-4 right-4 z-30 px-3 py-2 rounded-full bg-coral text-charcoal text-xs font-bold shadow-lg hover:bg-coral-dark transition-colors flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Feedback
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-50 flex items-center justify-center px-6"
            onClick={close}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass rounded-2xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold font-display mb-1">Send feedback</h3>
              <p className="text-cream-dim text-xs mb-4">
                Bugs, ideas, anything missing — drop a note and it goes straight to the dev.
              </p>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
                placeholder="What's on your mind?"
                rows={5}
                className="w-full px-3 py-2 rounded-xl bg-charcoal/60 border border-cream-dim/20 text-cream text-sm placeholder:text-cream-dim/60 focus:outline-none focus:border-coral resize-none"
                autoFocus
              />
              <div className="flex items-center justify-between mt-1 mb-4">
                <span className="text-cream-dim/60 text-[11px]">{body.length}/{MAX_LEN}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={close}
                  disabled={submitting}
                  className="flex-1 py-2 glass rounded-xl text-cream-dim hover:text-cream transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={submitting || !body.trim()}
                  className="flex-1 py-2 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Sending…' : 'Send'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
