'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FullPageSpinner } from '@/components/LoadingSpinner';

export default function FriendsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard?tab=friends');
  }, [router]);
  return <FullPageSpinner />;
}
