'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { authApi, providerApi } from '@/lib/api';
import { getBaseName } from '@/components/StreamingProviders';
import LetterboxdImport from '@/components/LetterboxdImport';

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;
const USERNAME_COOLDOWN_DAYS = 30;

interface ProviderOption {
  id: number;
  name: string;
  baseName: string;
  logoUrl: string;
  displayPriority: number;
}

const PREFERRED_PROVIDERS = [
  'Netflix', 'Disney Plus', 'Amazon Prime Video', 'Prime Video', 'Max', 'HBO Max',
  'Apple TV Plus', 'MUBI', 'Paramount Plus', 'NOW', 'BBC iPlayer', 'ITVX',
  'Channel 4', 'Crunchyroll', 'Hulu', 'Peacock', 'Shudder', 'BritBox',
];

export default function ProfilePage() {
  const { user, loading, logout, updateUsername, updatePreferredProviders } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState('');
  const [nameError, setNameError] = useState('');
  const [namePassword, setNamePassword] = useState('');
  const [availability, setAvailability] = useState<'unknown' | 'checking' | 'available' | 'taken' | 'invalid'>('unknown');
  const availabilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [savingProviders, setSavingProviders] = useState(false);
  const [providersError, setProvidersError] = useState('');
  const [providersExpanded, setProvidersExpanded] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth?mode=login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) setName(user.username);
  }, [user]);

  useEffect(() => {
    if (availabilityTimer.current) clearTimeout(availabilityTimer.current);
    if (!user) return;
    const normalized = name.trim().replace(/^@+/, '').toLowerCase();
    const changed = normalized !== user.username && normalized.length > 0;
    if (!changed) {
      setAvailability('unknown');
      return;
    }
    if (!USERNAME_RE.test(normalized)) {
      setAvailability('invalid');
      return;
    }
    setAvailability('checking');
    availabilityTimer.current = setTimeout(async () => {
      try {
        const res = await authApi.checkUsername(normalized);
        setAvailability(res.data.available ? 'available' : 'taken');
      } catch {
        setAvailability('unknown');
      }
    }, 350);
    return () => {
      if (availabilityTimer.current) clearTimeout(availabilityTimer.current);
    };
  }, [name, user]);

  useEffect(() => {
    let cancelled = false;
    providerApi.list()
      .then((res) => {
        if (cancelled) return;
        const raw = res.data.providers as { id: number; name: string; logoUrl: string; displayPriority?: number }[];
        const byBase = new Map<string, ProviderOption>();
        for (const p of raw) {
          const baseName = getBaseName(p.name);
          const priority = p.displayPriority ?? 9999;
          const existing = byBase.get(baseName);
          if (!existing || priority < existing.displayPriority) {
            byBase.set(baseName, { id: p.id, name: p.name, baseName, logoUrl: p.logoUrl, displayPriority: priority });
          }
        }
        const preferredRank = (n: string) => {
          const idx = PREFERRED_PROVIDERS.indexOf(n);
          return idx === -1 ? Infinity : idx;
        };
        const sorted = Array.from(byBase.values()).sort((a, b) => {
          const ap = PREFERRED_PROVIDERS.includes(a.baseName);
          const bp = PREFERRED_PROVIDERS.includes(b.baseName);
          if (ap !== bp) return ap ? -1 : 1;
          if (ap) return preferredRank(a.baseName) - preferredRank(b.baseName);
          return a.displayPriority - b.displayPriority;
        });
        setProviderOptions(sorted);
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setProvidersLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectedIds = useMemo(() => new Set(user?.preferredStreamingProviderIds || []), [user]);

  const toggleProvider = async (id: number) => {
    if (savingProviders) return;
    setProvidersError('');
    const current = user?.preferredStreamingProviderIds || [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setSavingProviders(true);
    try {
      await updatePreferredProviders(next);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      setProvidersError(apiErr.response?.data?.error || 'Failed to update');
    } finally {
      setSavingProviders(false);
    }
  };

  const visibleProviders = providersExpanded
    ? providerOptions
    : providerOptions.filter((p) => PREFERRED_PROVIDERS.includes(p.baseName) || selectedIds.has(p.id));
  const hiddenCount = providerOptions.length - visibleProviders.length;

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-12 h-12 border-3 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const normalizedName = name.trim().replace(/^@+/, '').toLowerCase();
  const nameChanged = normalizedName !== user.username && normalizedName.length > 0;
  const nameFormatValid = USERNAME_RE.test(normalizedName);

  const cooldownDaysLeft = (() => {
    if (!user.usernameChangedAt) return 0;
    const last = new Date(user.usernameChangedAt).getTime();
    const elapsedDays = (Date.now() - last) / (24 * 60 * 60 * 1000);
    return Math.max(0, Math.ceil(USERNAME_COOLDOWN_DAYS - elapsedDays));
  })();
  const onCooldown = cooldownDaysLeft > 0;

  const canSaveName =
    nameChanged && nameFormatValid && !savingName && !onCooldown &&
    availability === 'available' && namePassword.length > 0;

  const handleSaveName = async () => {
    setNameMsg('');
    setNameError('');
    setSavingName(true);
    try {
      await updateUsername(normalizedName, namePassword);
      setNameMsg('Saved');
      setNamePassword('');
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      setNameError(apiErr.response?.data?.error || 'Failed to update');
    } finally {
      setSavingName(false);
    }
  };

  const passwordReady =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  const handleChangePassword = async () => {
    setPasswordMsg('');
    setPasswordError('');
    if (!passwordReady) return;
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg('Password changed');
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      setPasswordError(apiErr.response?.data?.error || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const canDelete = confirmText === 'DELETE' && deletePassword.length >= 8;

  const handleDelete = async () => {
    setDeleteError('');
    setDeleting(true);
    try {
      await authApi.deleteAccount(deletePassword);
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
        <h1 className="text-2xl font-bold font-display">Profile</h1>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-cream-dim text-sm hover:text-danger transition-colors"
        >
          Back
        </button>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4 mb-6">
        <div>
          <label className="text-cream-dim text-xs uppercase tracking-wide">Email</label>
          <p className="text-lg font-medium mt-1">{user.email}</p>
        </div>
        <div>
          <label className="text-cream-dim text-xs uppercase tracking-wide mb-1 block">Username</label>
          <input
            type="text"
            value={name}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setName(e.target.value.replace(/\s/g, '').replace(/^@+/, '').toLowerCase());
              setNameMsg('');
              setNameError('');
            }}
            maxLength={30}
            className="w-full px-4 py-2.5 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-coral/60 border border-cream/10"
          />
          {nameChanged && (
            <p className="text-xs mt-1.5 min-h-[1rem]">
              {availability === 'checking' && <span className="text-cream-dim">Checking availability…</span>}
              {availability === 'available' && <span className="text-green-400">Available</span>}
              {availability === 'taken' && <span className="text-danger">That username is taken</span>}
              {availability === 'invalid' && (
                <span className="text-danger">3–30 characters, letters, numbers, underscore or hyphen</span>
              )}
            </p>
          )}
          {onCooldown && (
            <p className="text-xs mt-1.5 text-cream-dim">
              You can change your username again in {cooldownDaysLeft} day{cooldownDaysLeft === 1 ? '' : 's'}.
            </p>
          )}
          {nameChanged && !onCooldown && (
            <input
              type="password"
              value={namePassword}
              onChange={(e) => setNamePassword(e.target.value)}
              placeholder="Current password"
              className="w-full mt-2 px-4 py-2.5 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-coral/60 border border-cream/10"
            />
          )}
          <div className="flex items-center justify-between mt-2 min-h-[1.25rem]">
            <p className={`text-xs ${nameError ? 'text-danger' : 'text-cream-dim'}`}>
              {nameError || nameMsg}
            </p>
            <button
              onClick={handleSaveName}
              disabled={!canSaveName}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-coral text-charcoal hover:bg-coral-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 space-y-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold">My streaming services</h2>
          <p className="text-cream-dim text-xs mt-1">
            Discover and swipe filters default to these. You can override per session from the filter panel.
          </p>
        </div>
        {providersLoading ? (
          <p className="text-cream-dim text-xs">Loading services…</p>
        ) : providerOptions.length === 0 ? (
          <p className="text-cream-dim text-xs">Could not load services. Try again later.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleProviders.map((p) => {
              const selected = selectedIds.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProvider(p.id)}
                  disabled={savingProviders}
                  className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-xs transition-all hover:-translate-y-0.5 disabled:opacity-60 ${
                    selected ? 'bg-coral text-charcoal' : 'glass text-cream-dim'
                  }`}
                >
                  <img src={p.logoUrl} alt="" className="w-5 h-5 rounded" />
                  <span>{p.baseName}</span>
                </button>
              );
            })}
            {hiddenCount > 0 && !providersExpanded && (
              <button
                onClick={() => setProvidersExpanded(true)}
                className="px-3 py-1 rounded-full text-xs glass text-cream-dim hover:text-cream transition-colors"
              >
                +{hiddenCount} more
              </button>
            )}
            {providersExpanded && (
              <button
                onClick={() => setProvidersExpanded(false)}
                className="px-3 py-1 rounded-full text-xs glass text-cream-dim hover:text-cream transition-colors"
              >
                Show less
              </button>
            )}
          </div>
        )}
        {providersError && <p className="text-danger text-xs">{providersError}</p>}
      </div>

      <div className="glass rounded-2xl p-6 space-y-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold">Letterboxd</h2>
          <p className="text-cream-dim text-xs mt-1">
            {user.letterboxdUsername
              ? 'Change your Letterboxd username or pull a fresh sync.'
              : 'Connect your Letterboxd account to pull your watchlist and ratings.'}
          </p>
        </div>
        <LetterboxdImport mode="library" />
      </div>

      <div className="glass rounded-2xl p-6 space-y-3 mb-6">
        <h2 className="text-lg font-semibold">Change password</h2>
        <div>
          <label className="text-cream-dim text-xs mb-1 block">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setPasswordMsg('');
              setPasswordError('');
            }}
            className="w-full px-4 py-2.5 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-coral/60 border border-cream/10"
          />
        </div>
        <div>
          <label className="text-cream-dim text-xs mb-1 block">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordMsg('');
              setPasswordError('');
            }}
            className="w-full px-4 py-2.5 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-coral/60 border border-cream/10"
          />
        </div>
        <div>
          <label className="text-cream-dim text-xs mb-1 block">Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setPasswordMsg('');
              setPasswordError('');
            }}
            className="w-full px-4 py-2.5 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-coral/60 border border-cream/10"
          />
        </div>
        {confirmPassword.length > 0 && newPassword !== confirmPassword && (
          <p className="text-danger text-xs">Passwords do not match</p>
        )}
        {newPassword.length > 0 && newPassword.length < 8 && (
          <p className="text-cream-dim text-xs">Must be at least 8 characters</p>
        )}
        {passwordError && <p className="text-danger text-xs">{passwordError}</p>}
        {passwordMsg && <p className="text-green-400 text-xs">{passwordMsg}</p>}
        <button
          onClick={handleChangePassword}
          disabled={!passwordReady || savingPassword}
          className="w-full py-2.5 bg-coral text-charcoal rounded-xl font-medium hover:bg-coral-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {savingPassword ? 'Saving…' : 'Update password'}
        </button>
      </div>

      <div className="glass rounded-2xl p-6 border border-danger/30 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-danger">Danger zone</h2>
          <p className="text-cream-dim text-xs mt-1">
            Deleting your account is permanent. All your library, sessions, and matches will be removed.
          </p>
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
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full px-4 py-2.5 glass rounded-xl text-cream placeholder:text-cream-dim/50 focus:outline-none focus:border-danger/60 border border-cream/10"
              />
            </div>
            <div>
              <label className="text-cream-dim text-xs mb-1 block">
                Type <span className="text-danger font-bold">DELETE</span> to confirm
              </label>
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
                  setDeletePassword('');
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
