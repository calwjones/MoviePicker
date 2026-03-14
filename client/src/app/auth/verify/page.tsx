'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';

function VerifyContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setErrorMessage('Missing verification token.');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err?.response?.data?.error || 'Link is invalid or expired.');
      });
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm glass rounded-3xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-cream" style={{ fontFamily: 'var(--font-playfair)' }}>
          {status === 'pending' && 'Verifying…'}
          {status === 'success' && 'Email verified'}
          {status === 'error' && 'Verification failed'}
        </h1>
        {status === 'pending' && (
          <div className="flex items-center justify-center pt-2">
            <div className="w-10 h-10 border-3 border-coral border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {status === 'success' && (
          <>
            <p className="text-cream-dim text-sm">You&apos;re all set. You can sign in now.</p>
            <Link
              href="/auth?mode=login"
              className="inline-block w-full py-3 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors"
            >
              Sign in
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-danger text-sm">{errorMessage}</p>
            <Link
              href="/auth?mode=login"
              className="inline-block w-full py-3 glass text-cream rounded-xl hover:bg-card-hover transition-colors"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
