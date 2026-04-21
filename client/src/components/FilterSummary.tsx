'use client';

import type { Filters } from '@shared/types';

interface FilterSummaryProps {
  filters: Filters;
  onEdit: () => void;
  onClear?: () => void;
  open?: boolean;
}

function countActive(f: Filters): number {
  let n = 0;
  if (f.genres && f.genres.length > 0) n += 1;
  if (f.decade) n += 1;
  if (f.minRating > 0) n += 1;
  if (f.maxRuntime > 0) n += 1;
  if (f.streamingProviders && f.streamingProviders.length > 0) n += 1;
  return n;
}

function chipsFor(f: Filters): string[] {
  const out: string[] = [];
  if (f.genres && f.genres.length > 0) {
    const first = f.genres.slice(0, 2).join(', ');
    out.push(f.genres.length > 2 ? `${first} +${f.genres.length - 2}` : first);
  }
  if (f.decade) out.push(f.decade);
  if (f.minRating > 0) out.push(`★ ${f.minRating}+`);
  if (f.maxRuntime > 0) out.push(`≤ ${f.maxRuntime}m`);
  if (f.streamingProviders && f.streamingProviders.length > 0) {
    out.push(
      f.streamingProviders.length === 1
        ? f.streamingProviders[0]
        : `${f.streamingProviders.length} providers`,
    );
  }
  return out;
}

export default function FilterSummary({ filters, onEdit, onClear, open }: FilterSummaryProps) {
  const count = countActive(filters);
  const chips = chipsFor(filters);

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={onEdit}
          className="flex-1 text-left min-w-0"
          aria-label="Edit filters"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-cream font-semibold text-sm">Filters</span>
            {count > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-charcoal text-[10px] font-bold">
                {count}
              </span>
            )}
          </div>
          {chips.length === 0 ? (
            <p className="text-cream-dim text-xs">No filters applied. Tap to refine your pool.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span
                  key={c}
                  className="px-2 py-0.5 rounded-full bg-coral/15 text-coral text-[11px]"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </button>
        <div className="flex items-center gap-3 shrink-0">
          {count > 0 && onClear && (
            <button
              onClick={onClear}
              className="text-danger text-xs hover:underline"
            >
              Clear
            </button>
          )}
          <button
            onClick={onEdit}
            className="text-cream-dim text-xs hover:text-cream transition-colors"
          >
            {open ? 'Hide' : 'Edit'}
          </button>
        </div>
      </div>
    </div>
  );
}
