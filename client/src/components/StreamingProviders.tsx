'use client';

import { getProviderUrl } from '@/lib/providerLinks';

interface Provider {
  name: string;
  type: string;
  logoUrl: string;
}

export function getBaseName(name: string): string {
  return name
    .replace(/\+/g, ' Plus')           // Paramount+ → Paramount Plus
    .replace(/ with Ads$/i, '')          // "X with Ads" → "X"
    .replace(/ (Amazon|Apple TV) Channel$/i, '') // "X Amazon Channel" → "X"
    .replace(/ (Basic|Standard|Premium|Ad[- ]?Free)$/i, '') // "X Premium" → "X"
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeProviders(providers: Provider[]): Provider[] {
  const seen = new Map<string, Provider>();
  for (const p of providers) {
    const key = `${getBaseName(p.name)}::${p.type}`;
    if (!seen.has(key)) {
      seen.set(key, p);
    }
  }
  return Array.from(seen.values());
}

export default function StreamingProvidersList({ providers }: { providers: Provider[] }) {
  const cleaned = dedupeProviders(providers);
  const streaming = cleaned.filter((p) => p.type === 'stream');
  const rental = cleaned.filter((p) => p.type === 'rent');

  if (cleaned.length === 0) return null;

  return (
    <div className="space-y-3">
      {streaming.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {streaming.map((p, i) => (
            <ProviderChip key={i} provider={p} />
          ))}
        </div>
      )}
      {rental.length > 0 && (
        <div>
          <p className="text-xs text-cream-dim/50 mb-1.5">Also available to rent</p>
          <div className="flex flex-wrap gap-2">
            {rental.map((p, i) => (
              <ProviderChip key={i} provider={p} dim />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderChip({ provider, dim }: { provider: Provider; dim?: boolean }) {
  const url = getProviderUrl(provider.name);
  const className = `flex items-center gap-1.5 glass rounded-lg px-2 py-1 transition-colors hover:bg-cream/10 ${
    dim ? 'opacity-50' : ''
  }`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      <img src={provider.logoUrl} alt={provider.name} className="w-5 h-5 rounded" />
      <span className="text-xs text-cream-dim">{provider.name}</span>
    </a>
  );
}
