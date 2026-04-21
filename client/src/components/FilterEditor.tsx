'use client';

import type { Filters } from '@shared/types';
import { DECADE_OPTIONS } from '@/lib/decades';

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music',
  'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western',
];

export interface ProviderChip {
  name: string;
  logoUrl: string;
  displayPriority: number;
}

export const PREFERRED_PROVIDERS = [
  'Netflix',
  'Disney Plus',
  'Amazon Prime Video',
  'Prime Video',
  'Max',
  'HBO Max',
  'Apple TV Plus',
  'MUBI',
  'Paramount Plus',
  'NOW',
  'BBC iPlayer',
  'ITVX',
  'Channel 4',
  'Crunchyroll',
  'Hulu',
  'Peacock',
  'Shudder',
  'BritBox',
];

interface FilterEditorProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  streamingProviders: ProviderChip[];
  confirmedProviderNames?: Set<string>;
  batchSize?: number | null;
  onBatchSizeChange?: (size: number | null) => void;
  showBatchSize?: boolean;
  providersExpanded: boolean;
  onProvidersExpandedChange: (expanded: boolean) => void;
}

export default function FilterEditor({
  filters,
  onChange,
  streamingProviders,
  confirmedProviderNames,
  batchSize,
  onBatchSizeChange,
  showBatchSize = true,
  providersExpanded,
  onProvidersExpandedChange,
}: FilterEditorProps) {
  const toggleGenre = (genre: string) => {
    const current = filters.genres || [];
    const next = current.includes(genre)
      ? current.filter((g) => g !== genre)
      : [...current, genre];
    onChange({ ...filters, genres: next });
  };

  const selectedProviders = new Set(filters.streamingProviders || []);
  const defaultSlice = streamingProviders.filter((p) => PREFERRED_PROVIDERS.includes(p.name));
  const extraSelected = streamingProviders.filter(
    (p) => !PREFERRED_PROVIDERS.includes(p.name) && selectedProviders.has(p.name),
  );
  const visibleProviders = providersExpanded
    ? streamingProviders
    : [...defaultSlice, ...extraSelected];
  const hiddenCount = streamingProviders.length - visibleProviders.length;

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div>
        <label className="text-cream-dim text-sm mb-2 block">Genres</label>
        <div className="flex flex-wrap gap-2">
          {GENRE_OPTIONS.map((genre) => (
            <button
              key={genre}
              onClick={() => toggleGenre(genre)}
              className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 ${
                (filters.genres || []).includes(genre)
                  ? 'bg-coral text-charcoal'
                  : 'glass text-cream-dim'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-cream-dim text-sm mb-2 block">Decade</label>
        <div className="flex flex-wrap gap-2">
          {DECADE_OPTIONS.map((decade) => (
            <button
              key={decade}
              onClick={() => onChange({ ...filters, decade: filters.decade === decade ? '' : decade })}
              className={`px-3 py-1.5 rounded-full text-xs transition-all hover:-translate-y-0.5 ${
                filters.decade === decade ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
              }`}
            >
              {decade}s
            </button>
          ))}
        </div>
      </div>

      {streamingProviders.length > 0 && (
        <div>
          <label className="text-cream-dim text-sm mb-2 block">
            Streaming Service
            {confirmedProviderNames && confirmedProviderNames.size > 0 && (
              <span className="ml-2 text-[10px] text-cream-dim/70">
                <span className="text-coral">★</span> = from your profile
              </span>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            {visibleProviders.map((provider) => {
              const selected = selectedProviders.has(provider.name);
              const confirmed = confirmedProviderNames?.has(provider.name) ?? false;
              return (
                <button
                  key={provider.name}
                  onClick={() =>
                    onChange({
                      ...filters,
                      streamingProviders: selected
                        ? (filters.streamingProviders || []).filter((s) => s !== provider.name)
                        : [...(filters.streamingProviders || []), provider.name],
                    })
                  }
                  className={`relative flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-xs transition-all hover:-translate-y-0.5 ${
                    selected ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
                  }`}
                >
                  <img src={provider.logoUrl} alt="" className="w-5 h-5 rounded" />
                  <span>{provider.name}</span>
                  {confirmed && (
                    <span
                      aria-label="From your profile"
                      className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] leading-none ${
                        selected ? 'bg-charcoal text-coral' : 'bg-coral text-charcoal'
                      }`}
                    >
                      ★
                    </span>
                  )}
                </button>
              );
            })}
            {hiddenCount > 0 && !providersExpanded && (
              <button
                onClick={() => onProvidersExpandedChange(true)}
                className="px-3 py-1 rounded-full text-xs glass text-cream-dim hover:text-cream transition-colors"
              >
                +{hiddenCount} more
              </button>
            )}
            {providersExpanded && (
              <button
                onClick={() => onProvidersExpandedChange(false)}
                className="px-3 py-1 rounded-full text-xs glass text-cream-dim hover:text-cream transition-colors"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="text-cream-dim text-sm mb-2 block">
          Min TMDb Rating: {filters.minRating > 0 ? filters.minRating : 'Any'}
        </label>
        <input
          type="range" min="0" max="9" step="0.5"
          value={filters.minRating}
          onChange={(e) => onChange({ ...filters, minRating: parseFloat(e.target.value) })}
          className="w-full accent-coral"
        />
      </div>

      <div>
        <label className="text-cream-dim text-sm mb-2 block">
          Max Runtime: {filters.maxRuntime > 0 ? `${filters.maxRuntime} min` : 'Any'}
        </label>
        <input
          type="range" min="0" max="240" step="15"
          value={filters.maxRuntime}
          onChange={(e) => onChange({ ...filters, maxRuntime: parseInt(e.target.value) })}
          className="w-full accent-coral"
        />
      </div>

      {showBatchSize && onBatchSizeChange && (
        <div>
          <label className="text-cream-dim text-sm mb-2 block">Batch size</label>
          <div className="flex flex-wrap gap-2">
            {[10, 20, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => onBatchSizeChange(size)}
                className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                  batchSize === size ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
                }`}
              >
                {size}
              </button>
            ))}
            <button
              onClick={() => onBatchSizeChange(null)}
              className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                batchSize === null ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
              }`}
            >
              All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
