'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { providerApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getBaseName } from './StreamingProviders';
import LetterboxdImport from './LetterboxdImport';
import OnboardingSeedGrid from './OnboardingSeedGrid';

type Path = 'together' | 'solo' | 'discover';
type Step = 0 | 1 | 2 | 3 | 4;

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onPickPath: (path: Path) => void;
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

const PREFERRED_PROVIDERS = [
  'Netflix', 'Disney Plus', 'Amazon Prime Video', 'Prime Video', 'Max', 'HBO Max',
  'Apple TV Plus', 'MUBI', 'Paramount Plus', 'NOW', 'BBC iPlayer', 'ITVX',
  'Channel 4', 'Crunchyroll', 'Hulu', 'Peacock', 'Shudder', 'BritBox',
];

interface ProviderOption {
  id: number;
  baseName: string;
  logoUrl: string;
  displayPriority: number;
}

export default function OnboardingModal({ open, onClose, onPickPath }: OnboardingModalProps) {
  const { user, updatePreferredProviders } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [savingProviders, setSavingProviders] = useState(false);

  useEffect(() => { if (open) setStep(0); }, [open]);

  useEffect(() => {
    if (step !== 3 || providerOptions.length > 0) return;
    setProvidersLoading(true);
    providerApi.list()
      .then((res) => {
        const raw = res.data.providers as { id: number; name: string; logoUrl: string; displayPriority?: number }[];
        const byBase = new Map<string, ProviderOption>();
        for (const p of raw) {
          const baseName = getBaseName(p.name);
          const priority = p.displayPriority ?? 9999;
          const existing = byBase.get(baseName);
          if (!existing || priority < existing.displayPriority) {
            byBase.set(baseName, { id: p.id, baseName, logoUrl: p.logoUrl, displayPriority: priority });
          }
        }
        const sorted = Array.from(byBase.values())
          .filter((p) => PREFERRED_PROVIDERS.includes(p.baseName))
          .sort((a, b) => PREFERRED_PROVIDERS.indexOf(a.baseName) - PREFERRED_PROVIDERS.indexOf(b.baseName));
        setProviderOptions(sorted);
      })
      .catch(() => {})
      .finally(() => setProvidersLoading(false));
  }, [step, providerOptions.length]);

  const selectedIds = useMemo(() => new Set(user?.preferredStreamingProviderIds ?? []), [user]);

  const toggleProvider = async (id: number) => {
    if (savingProviders) return;
    const current = user?.preferredStreamingProviderIds ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setSavingProviders(true);
    try {
      await updatePreferredProviders(next);
    } finally {
      setSavingProviders(false);
    }
  };

  const goNext = () => setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  const goBack = () => setStep((s) => (s > 0 ? ((s - 1) as Step) : s));

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
              <div className="flex justify-center gap-1.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === step ? 'w-6 bg-coral' : i < step ? 'w-1.5 bg-coral/60' : 'w-1.5 bg-cream/15'
                    }`}
                  />
                ))}
              </div>

              {step === 0 && (
                <>
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-cream mb-1" style={{ fontFamily: 'var(--font-playfair)' }}>
                      Welcome to MatchSticked
                    </h2>
                    <p className="text-cream-dim text-sm">
                      Your movie decision engine — together or solo.
                    </p>
                  </div>
                  <div className="space-y-2 text-cream-dim text-sm">
                    <p>We&apos;ll set you up in three quick steps:</p>
                    <ul className="list-disc list-inside space-y-1 pl-2 text-xs">
                      <li>Bring your Letterboxd library</li>
                      <li>Pick your streaming services</li>
                      <li>Choose where to start</li>
                    </ul>
                  </div>
                  <button
                    onClick={goNext}
                    className="w-full py-3 bg-coral text-charcoal rounded-xl font-semibold hover:bg-coral-dark transition-colors"
                  >
                    Get started
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full py-2 text-cream-dim text-sm hover:text-cream transition-colors"
                  >
                    Skip for now
                  </button>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-cream mb-1" style={{ fontFamily: 'var(--font-playfair)' }}>
                      Bring your library
                    </h2>
                    <p className="text-cream-dim text-sm">
                      Sync your Letterboxd watchlist and ratings so your picks start smart.
                    </p>
                  </div>
                  <LetterboxdImport
                    mode="onboarding"
                    onSuccess={goNext}
                    onSkip={goNext}
                  />
                  <button
                    onClick={goBack}
                    className="w-full py-2 text-cream-dim/70 text-xs hover:text-cream transition-colors"
                  >
                    Back
                  </button>
                </>
              )}

              {step === 2 && (
                <>
                  <OnboardingSeedGrid onDone={goNext} onSkip={goNext} />
                  <button
                    onClick={goBack}
                    className="w-full py-2 text-cream-dim/70 text-xs hover:text-cream transition-colors"
                  >
                    Back
                  </button>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-cream mb-1" style={{ fontFamily: 'var(--font-playfair)' }}>
                      Where do you watch?
                    </h2>
                    <p className="text-cream-dim text-sm">
                      Pick your streaming services. We&apos;ll tailor recommendations and filters.
                    </p>
                  </div>
                  {providersLoading ? (
                    <p className="text-cream-dim text-xs text-center py-4">Loading services…</p>
                  ) : providerOptions.length === 0 ? (
                    <p className="text-cream-dim text-xs text-center py-4">Could not load services. Skip for now.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {providerOptions.map((p) => {
                        const selected = selectedIds.has(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => toggleProvider(p.id)}
                            disabled={savingProviders}
                            className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-xs transition-all hover:-translate-y-0.5 disabled:opacity-60 ${
                              selected ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
                            }`}
                          >
                            <img src={p.logoUrl} alt="" className="w-5 h-5 rounded" />
                            <span>{p.baseName}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button
                    onClick={goNext}
                    className="w-full py-3 bg-coral text-charcoal rounded-xl font-semibold hover:bg-coral-dark transition-colors"
                  >
                    Continue
                  </button>
                  <button
                    onClick={goBack}
                    className="w-full py-2 text-cream-dim/70 text-xs hover:text-cream transition-colors"
                  >
                    Back
                  </button>
                </>
              )}

              {step === 4 && (
                <>
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-cream mb-1" style={{ fontFamily: 'var(--font-playfair)' }}>
                      What brings you here?
                    </h2>
                    <p className="text-cream-dim text-sm">
                      Pick a path. You can always do the others later.
                    </p>
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
                    className="w-full py-2 text-cream-dim text-sm hover:text-cream transition-colors"
                  >
                    Skip for now
                  </button>
                  <button
                    onClick={goBack}
                    className="w-full py-2 text-cream-dim/70 text-xs hover:text-cream transition-colors"
                  >
                    Back
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
