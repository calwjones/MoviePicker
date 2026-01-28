'use client';

const sizes = {
  sm: 'w-5 h-5 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
};

export default function LoadingSpinner({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`${sizes[size]} border-amber border-t-transparent rounded-full animate-spin`} />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-dvh">
      <LoadingSpinner />
    </div>
  );
}
