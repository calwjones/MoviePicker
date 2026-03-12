'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';

interface GuestConvertModalProps {
  open: boolean;
  onClose: () => void;
  defaultName?: string;
  onConverted?: () => void;
}

export default function GuestConvertModal({ open, onClose, defaultName = '', onConverted }: GuestConvertModalProps) {
  const [displayName, setDisplayName] = useState(defaultName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.register(email, password, displayName);
      localStorage.setItem('token', res.data.token);
      localStorage.removeItem('guest_session_id');
      localStorage.removeItem('user_token_backup');
      onConverted?.();
      onClose();
      window.location.reload();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not create account'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal/85 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none"
          >
            <div className="glass rounded-3xl p-6 w-full max-w-md space-y-4 pointer-events-auto max-h-[90vh] overflow-y-auto">
              <div className="text-center">
                <h2
                  className="text-2xl font-bold text-cream mb-1"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  Save your matches
                </h2>
                <p className="text-cream-dim text-sm">Create an account to come back to these picks and build your own library.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  minLength={2}
                  className="w-full px-4 py-3 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-coral/60 border border-cream/10"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-coral/60 border border-cream/10"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-coral/60 border border-cream/10"
                />

                {error && (
                  <p className="text-danger text-xs text-center">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 text-cream-dim text-sm hover:text-cream transition-colors"
                >
                  Not now
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
