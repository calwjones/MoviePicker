'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { authApi } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
    } catch { /* ignore — always show success for security */ }
    finally {
      setSubmitted(true);
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-dvh px-6">
        <div className="w-full max-w-sm glass rounded-3xl p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold text-cream" style={{ fontFamily: 'var(--font-playfair)' }}>
            Check your inbox
          </h1>
          <p className="text-cream-dim text-sm">
            If an account exists for <span className="text-cream">{email}</span>, a reset link is on its way. The link expires in 15 minutes.
          </p>
          <Link
            href="/auth?mode=login"
            className="inline-block w-full py-3 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-dvh px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <h1 className="text-3xl font-bold mb-2 text-center" style={{ fontFamily: 'var(--font-playfair)' }}>
          Forgot password
        </h1>
        <p className="text-cream-dim text-center mb-8">Enter your email to get a reset link.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 glass rounded-xl bg-transparent text-cream placeholder:text-cream-dim focus:outline-none focus:ring-2 focus:ring-coral"
          />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-coral text-charcoal font-semibold rounded-xl text-lg hover:bg-coral-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </motion.button>
        </form>

        <p className="text-center mt-6">
          <Link href="/auth?mode=login" className="text-cream-dim text-sm hover:text-cream transition-colors">
            Back to sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
