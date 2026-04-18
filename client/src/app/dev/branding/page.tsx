'use client';

import { useState } from 'react';
import MatchstickLogo from '@/components/MatchstickLogo';
import MatchStrikeLoader from '@/components/MatchStrikeLoader';

export default function BrandingPreview() {
  const [bg, setBg] = useState<'charcoal' | 'cream' | 'card'>('charcoal');
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);

  const bgClass = {
    charcoal: 'bg-charcoal',
    cream: 'bg-cream',
    card: 'bg-card',
  }[bg];

  const textClass = bg === 'cream' ? 'text-charcoal' : 'text-cream';

  return (
    <div className={`min-h-dvh ${bgClass} ${textClass} px-6 py-8 transition-colors`}>
      <div className="max-w-5xl mx-auto space-y-10">
        <header className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-playfair)' }}>
            Branding playground
          </h1>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex gap-1">
              {(['charcoal', 'card', 'cream'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBg(b)}
                  className={`px-3 py-1 rounded-lg border ${
                    bg === b ? 'border-coral text-coral' : 'border-cream-dim/30 opacity-70'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2">
              speed
              <input
                type="range"
                min={0.3}
                max={2.5}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
              />
              <span className="tabular-nums w-10 text-right">{speed.toFixed(1)}x</span>
            </label>
            <button
              onClick={() => setTick((t) => t + 1)}
              className="px-3 py-1 rounded-lg border border-coral text-coral"
            >
              restart
            </button>
          </div>
        </header>

        {/* Static logo at multiple sizes */}
        <section className="space-y-4">
          <h2 className="text-sm uppercase tracking-widest opacity-60">Static logo</h2>
          <div className="flex items-end gap-8 flex-wrap">
            {[16, 24, 32, 48, 64, 96, 160].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <MatchstickLogo size={s} />
                <span className="text-xs opacity-60 tabular-nums">{s}px</span>
              </div>
            ))}
          </div>
        </section>

        {/* Wordmark mockup */}
        <section className="space-y-4">
          <h2 className="text-sm uppercase tracking-widest opacity-60">Wordmark</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <MatchstickLogo size={40} />
            <span className="text-3xl font-bold" style={{ fontFamily: 'var(--font-playfair)' }}>
              Match<span className="text-coral">Sticked</span>
            </span>
          </div>
        </section>

        {/* Loader at sizes, with speed control */}
        <section className="space-y-4">
          <h2 className="text-sm uppercase tracking-widest opacity-60">Match-strike loader</h2>
          <div
            key={tick}
            className="flex items-end gap-10 flex-wrap"
            style={{ ['--ms-speed' as string]: speed.toString() }}
          >
            {[100, 160, 220, 320].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <MatchStrikeLoader size={s} />
                <span className="text-xs opacity-60 tabular-nums">{s}px</span>
              </div>
            ))}
          </div>
          <p className="text-xs opacity-60">
            Speed slider applies via inline style; full-page loader cycle is 3.4s by default.
          </p>
        </section>

        {/* Loader on context — full-bleed card */}
        <section className="space-y-4">
          <h2 className="text-sm uppercase tracking-widest opacity-60">Full-page context</h2>
          <div className="bg-charcoal rounded-3xl border border-cream-dim/10 h-[420px] flex items-center justify-center">
            <MatchStrikeLoader size={200} />
          </div>
        </section>
      </div>

      <style>{`
        .ms-match,
        .ms-flame,
        .ms-sparks {
          animation-duration: calc(3.0s / var(--ms-speed, 1)) !important;
        }
      `}</style>
    </div>
  );
}
