'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FriendsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard?tab=friends');
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-dvh">
      <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
