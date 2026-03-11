'use client';

import SkeletonCard from './SkeletonCard';

interface SkeletonListProps {
  count?: number;
}

export default function SkeletonList({ count = 3 }: SkeletonListProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
