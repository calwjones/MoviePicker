'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'framer-motion';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-3 border-amber border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="text-center max-w-md"
      >
        <h1
          className="text-5xl font-bold mb-4 tracking-tight"
          style={{ fontFamily: 'var(--font-playfair)' }}
        >
          Movie<span className="text-amber">Picker</span>
        </h1>
        <p className="text-cream-dim text-lg mb-10">
          Pick a movie together. No more scrolling debates.
        </p>

        <div className="flex flex-col gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/auth?mode=register')}
            className="w-full py-4 bg-amber text-charcoal font-semibold rounded-xl text-lg transition-colors hover:bg-amber-dark"
          >
            Get Started
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/auth?mode=login')}
            className="w-full py-4 glass text-cream font-semibold rounded-xl text-lg"
          >
            Sign In
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
