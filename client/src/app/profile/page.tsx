'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/lib/api';

export default function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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

  const canDelete = confirmText === 'DELETE' && password.length >= 8;

  const handleDelete = async () => {
    setDeleteError('');
    setDeleting(true);
    try {
      await authApi.deleteAccount(password);
      logout();
      router.push('/auth?mode=register');
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      setDeleteError(apiErr.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

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

      <div className="glass rounded-2xl p-6 space-y-4 mb-6">
        <div>
          <label className="text-cream-dim text-xs uppercase tracking-wide">Display Name</label>
          <p className="text-lg font-medium mt-1">{user.displayName}</p>
        </div>
        <div>
          <label className="text-cream-dim text-xs uppercase tracking-wide">Email</label>
          <p className="text-lg font-medium mt-1">{user.email}</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 border border-danger/30 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-danger">Danger zone</h2>
          <p className="text-cream-dim text-xs mt-1">Deleting your account is permanent. All your library, sessions, and matches will be removed.</p>
        </div>

        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="w-full py-3 glass rounded-xl text-danger border border-danger/30 hover:bg-danger/10 transition-colors"
          >
            Delete account
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-cream-dim text-xs mb-1 block">Confirm your password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-danger/60 border border-cream/10"
              />
            </div>
            <div>
              <label className="text-cream-dim text-xs mb-1 block">Type <span className="text-danger font-bold">DELETE</span> to confirm</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full px-4 py-2.5 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-danger/60 border border-cream/10 font-mono"
              />
            </div>

            {deleteError && <p className="text-danger text-xs">{deleteError}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDelete(false);
                  setPassword('');
                  setConfirmText('');
                  setDeleteError('');
                }}
                className="flex-1 py-2.5 glass rounded-xl text-cream-dim hover:text-cream transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!canDelete || deleting}
                className="flex-1 py-2.5 bg-danger/80 text-cream rounded-xl hover:bg-danger transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
