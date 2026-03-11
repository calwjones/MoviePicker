'use client';

interface Provider {
  name: string;
  type: string;
  logoUrl: string;
}

function getBaseName(name: string): string {
  // Normalize provider names to catch duplicates like:
  // "Paramount Plus", "Paramount+ Amazon Channel", "Paramount Plus Apple TV Channel"
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
    // Keep the first (usually the "cleanest" name) per base name + type
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
            <div key={i} className="flex items-center gap-1.5 glass rounded-lg px-2 py-1">
              <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded" />
              <span className="text-xs text-cream-dim">{p.name}</span>
            </div>
          ))}
        </div>
      )}
      {rental.length > 0 && (
        <div>
          <p className="text-xs text-cream-dim/50 mb-1.5">Also available to rent</p>
          <div className="flex flex-wrap gap-2">
            {rental.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 glass rounded-lg px-2 py-1 opacity-50">
                <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded" />
                <span className="text-xs text-cream-dim">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
