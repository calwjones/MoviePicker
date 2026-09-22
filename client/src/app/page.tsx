'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { FullPageSpinner } from '@/components/LoadingSpinner';
import MatchstickLogo from '@/components/MatchstickLogo';

const STEPS = [
  {
    title: 'Bring your watchlists',
    body: 'Add films you’d happily watch, or pull them straight in from Letterboxd.',
  },
  {
    title: 'Everyone swipes',
    body: 'Friends join from a link or a six-letter code, no account needed. Swipe right to strike, left to pass.',
  },
  {
    title: 'Strike a match',
    body: 'Anything the whole room likes lights up. Still torn? Let the roulette decide.',
  },
];

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading || user) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0.7, 0.3, 1] }}
        className="text-center max-w-md w-full"
      >
        <div className="relative mx-auto mb-6 w-fit">
          <div className="absolute inset-0 -m-6 rounded-full bg-coral/20 blur-2xl" aria-hidden="true" />
          <MatchstickLogo size={56} className="relative match-pulse" decorative />
        </div>
        <h1 className="text-5xl font-bold mb-4 tracking-tight font-display">
          Match<span className="text-ember">sticked</span>
        </h1>
        <p className="text-cream-dim text-lg mb-10">
          Pick a movie together. No more scrolling debates.
        </p>

        <div className="flex flex-col gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/auth?mode=register')}
            className="w-full py-4 bg-coral text-cream font-semibold rounded-xl text-lg transition-colors hover:bg-coral-dark"
          >
            Get started
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/auth?mode=login')}
            className="w-full py-4 glass text-cream font-semibold rounded-xl text-lg"
          >
            Sign in
          </motion.button>
        </div>
      </motion.div>

      <motion.ol
        initial="hidden"
        animate="shown"
        variants={{ shown: { transition: { staggerChildren: 0.12, delayChildren: 0.35 } } }}
        className="mt-16 max-w-md w-full space-y-3"
        aria-label="How it works"
      >
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0 } }}
            className="glass rounded-2xl p-4 flex gap-4 items-start text-left"
          >
            <span className="shrink-0 w-8 h-8 rounded-full bg-coral/15 ring-1 ring-coral/40 text-ember font-display font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <div>
              <h2 className="font-semibold text-cream">{step.title}</h2>
              <p className="text-cream-dim text-sm mt-0.5">{step.body}</p>
            </div>
          </motion.li>
        ))}
      </motion.ol>
    </div>
  );
}
