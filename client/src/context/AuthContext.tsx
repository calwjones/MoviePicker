'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  isGuest?: boolean;
  preferredStreamingProviderIds?: number[];
  letterboxdUsername?: string | null;
  onboardedAt?: string | null;
  usernameChangedAt?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => void;
  updateUsername: (username: string, currentPassword: string) => Promise<void>;
  updatePreferredProviders: (providerIds: number[]) => Promise<void>;
  setLetterboxdUsername: (username: string | null) => void;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

const USER_CACHE_KEY = 'user_cache';

function readCachedUser(userId: unknown): User | null {
  if (typeof userId !== 'string') return null;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as User) : null;
    // Never show one account's profile under another account's token.
    return parsed && parsed.id === userId ? parsed : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    const payload = decodeJwtPayload(token);
    if (payload?.guestId) {
      setUser({
        id: payload.guestId as string,
        email: '',
        username: (payload.displayName as string) || 'Guest',
        isGuest: true,
      });
      setLoading(false);
      return;
    }

    // Render straight away from the last known profile, then confirm with the
    // server in the background. Saves a full round trip on every app open.
    const cached = readCachedUser(payload?.userId);
    if (cached) {
      setUser(cached);
      setLoading(false);
    }

    authApi.me()
      .then((res) => setUser(res.data.user))
      .catch((err) => {
        // Only a rejected token signs you out; a flaky connection shouldn't.
        if ((err as { response?: { status?: number } })?.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem(USER_CACHE_KEY);
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user || user.isGuest) return;
    try {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } catch { /* storage full or disabled */ }
  }, [user]);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    localStorage.setItem('token', res.data.token);
    // Re-authenticate any socket still holding a previous session's token.
    connectSocket();
    setUser(res.data.user);
  };

  const register = async (email: string, password: string, username: string) => {
    // Server now requires email verification before granting a session token.
    // No state change here — the auth page shows a "Check your inbox" screen.
    await authApi.register(email, password, username);
  };

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('guest_session_id');
    localStorage.removeItem('user_token_backup');
    localStorage.removeItem(USER_CACHE_KEY);
    disconnectSocket();
    setUser(null);
  }, []);

  const updateUsername = async (username: string, currentPassword: string) => {
    const res = await authApi.updateProfile(username, currentPassword);
    setUser((prev) => (prev ? {
      ...prev,
      username: res.data.user.username,
      usernameChangedAt: res.data.user.usernameChangedAt,
    } : prev));
  };

  const updatePreferredProviders = async (providerIds: number[]) => {
    const res = await authApi.updatePreferredProviders(providerIds);
    setUser((prev) => (prev ? { ...prev, preferredStreamingProviderIds: res.data.user.preferredStreamingProviderIds } : prev));
  };

  const setLetterboxdUsername = useCallback((username: string | null) => {
    setUser((prev) => (prev ? { ...prev, letterboxdUsername: username } : prev));
  }, []);

  const completeOnboarding = useCallback(async () => {
    const res = await authApi.completeOnboarding();
    setUser((prev) => (prev ? { ...prev, onboardedAt: res.data.user.onboardedAt } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUsername, updatePreferredProviders, setLetterboxdUsername, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
