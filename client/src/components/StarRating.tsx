'use client';

interface StarRatingProps {
  value: number | null;
  onChange?: (rating: number) => void;
  readonly?: boolean;
}

export default function StarRating({ value, onChange, readonly }: StarRatingProps) {
  return (
    <div className="flex gap-1" style={{ touchAction: 'manipulation' }}>
      {[1, 2, 3, 4, 5].map((starIndex) => {
        const val = value || 0;
        const isFull = val >= starIndex;
        const isHalf = val >= starIndex - 0.5 && val < starIndex;

        return (
          <div key={starIndex} className="relative w-4 h-4 text-sm leading-none flex items-center justify-center">
            <div className="text-cream-dim/30">&#9733;</div>
            <div
              className="absolute left-0 top-0 overflow-hidden text-coral pointer-events-none flex items-center justify-start h-full"
              style={{ width: isFull ? '100%' : isHalf ? '50%' : '0%' }}
            >
              &#9733;
            </div>

            {!readonly && (
              <>
                <button
                  className="absolute left-0 top-0 w-1/2 h-full z-10 hover:bg-cream/10 rounded-l"
                  onClick={() => onChange?.(starIndex - 0.5)}
                  disabled={readonly}
                  title={`${starIndex - 0.5} stars`}
                />
                <button
                  className="absolute right-0 top-0 w-1/2 h-full z-10 hover:bg-cream/10 rounded-r"
                  onClick={() => onChange?.(starIndex)}
                  disabled={readonly}
                  title={`${starIndex} stars`}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
