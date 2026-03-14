'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth?mode=login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-6 py-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold font-display">
          Profile
        </h1>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-cream-dim text-sm hover:text-danger transition-colors"
        >
          Back
        </button>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <div>
          <label className="text-cream-dim text-xs uppercase tracking-wide">Display Name</label>
          <p className="text-lg font-medium mt-1">{user.displayName}</p>
        </div>
        <div>
          <label className="text-cream-dim text-xs uppercase tracking-wide">Email</label>
          <p className="text-lg font-medium mt-1">{user.email}</p>
        </div>
      </div>

      <p className="text-cream-dim text-sm text-center mt-8">
        More profile settings coming soon.
      </p>
    </div>
  );
}
