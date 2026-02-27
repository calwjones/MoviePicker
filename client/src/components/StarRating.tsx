'use client';

interface StarRatingProps {
  value: number | null;
  onChange?: (rating: number) => void;
  readonly?: boolean;
}

export default function StarRating({ value, onChange, readonly }: StarRatingProps) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => !readonly && onChange?.(star * 2)}
          disabled={readonly}
          className={`text-sm transition-colors ${
            (value || 0) >= star * 2
              ? 'text-amber'
              : 'text-cream-dim/30 hover:text-amber/60'
          } ${readonly ? 'cursor-default' : ''}`}
        >
          &#9733;
        </button>
      ))}
    </div>
  );
}
