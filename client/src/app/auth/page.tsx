'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';

function AuthForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const router = useRouter();

  const expired = searchParams.get('expired') === '1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        await register(email, password, displayName);
      } else {
        await login(email, password);
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-dvh px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <h1
          className="text-3xl font-bold mb-2 text-center"
          style={{ fontFamily: 'var(--font-playfair)' }}
        >
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="text-cream-dim text-center mb-8">
          {mode === 'login' ? 'Sign in to continue' : 'Join MoviePicker'}
        </p>

        {expired && (
          <div className="mb-4 p-3 glass rounded-xl border border-coral/30">
            <p className="text-danger text-sm text-center">Your session expired. Please sign in again.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full px-4 py-3 glass rounded-xl bg-transparent text-cream placeholder:text-cream-dim focus:outline-none focus:ring-2 focus:ring-coral"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 glass rounded-xl bg-transparent text-cream placeholder:text-cream-dim focus:outline-none focus:ring-2 focus:ring-coral"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-4 py-3 glass rounded-xl bg-transparent text-cream placeholder:text-cream-dim focus:outline-none focus:ring-2 focus:ring-coral"
          />

          {error && (
            <p className="text-danger text-sm text-center">{error}</p>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-coral text-charcoal font-semibold rounded-xl text-lg transition-colors hover:bg-coral-dark disabled:opacity-50"
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </motion.button>
        </form>

        <p className="text-center text-cream-dim mt-6">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="text-danger hover:underline"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AuthForm />
    </Suspense>
  );
}
