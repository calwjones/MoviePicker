'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { sessionApi, soloApi, movieApi, providerApi, friendsApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import LoadingSpinner from '@/components/LoadingSpinner';
import { connectSocket, getSocket } from '@/lib/socket';
import { getBaseName } from '@/components/StreamingProviders';
import FilterSummary from '@/components/FilterSummary';
import FilterEditor from '@/components/FilterEditor';
import { useAuth } from '@/context/AuthContext';
import type { Filters } from '@matchsticked/shared';

interface ProviderChip {
  name: string;
  logoUrl: string;
  displayPriority: number;
}

type ProviderIdMap = Record<string, number>;

const PREFERRED_PROVIDERS = [
  'Netflix',
  'Disney Plus',
  'Amazon Prime Video',
  'Prime Video',
  'Max',
  'HBO Max',
  'Apple TV Plus',
  'MUBI',
  'Paramount Plus',
  'NOW',
  'BBC iPlayer',
  'ITVX',
  'Channel 4',
  'Crunchyroll',
  'Hulu',
  'Peacock',
  'Shudder',
  'BritBox',
];

const RENTAL_PROVIDERS = new Set([
  'Google Play Movies',
  'YouTube',
  'Apple TV',
  'iTunes',
  'Amazon Video',
  'Microsoft Store',
  'Xbox',
  'Rakuten TV',
  'Chili',
  'Sky Store',
  'Fandango At Home',
  'Vudu',
  'Redbox',
]);

interface Participant {
  displayName: string;
  type: 'registered' | 'guest';
}

interface SwipeTabProps {
  addToast: (message: string) => void;
}

export default function SwipeTab({ addToast }: SwipeTabProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [poolSize, setPoolSize] = useState<number>(0);
  const [poolSizeLoading, setPoolSizeLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [streamingProviders, setStreamingProviders] = useState<ProviderChip[]>([]);
  const [providerIdByBase, setProviderIdByBase] = useState<ProviderIdMap>({});
  const [providersExpanded, setProvidersExpanded] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [soloLoading, setSoloLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const [groupSessionId, setGroupSessionId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinCodeLoading, setJoinCodeLoading] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState('');
  const [friends, setFriends] = useState<{ id: string; username: string }[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    genres: [], decade: '', minRating: 0, maxRuntime: 0, streamingProviders: [],
  });
  const [batchSize, setBatchSize] = useState<number | null>(50);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('moviepicker_filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.streamingProviders)) {
          parsed.streamingProviders = Array.from(
            new Set(parsed.streamingProviders.map((s: string) => getBaseName(s)))
          );
        }
        setFilters((prev) => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('moviepicker_filters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('moviepicker_batch_size');
      if (saved !== null) {
        if (saved === 'all') setBatchSize(null);
        else {
          const parsed = parseInt(saved, 10);
          if (!Number.isNaN(parsed) && parsed > 0) setBatchSize(parsed);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'moviepicker_batch_size',
      batchSize === null ? 'all' : String(batchSize),
    );
  }, [batchSize]);

  useEffect(() => {
    const run = async () => {
      setPoolSizeLoading(true);
      try {
        const [poolRes, provRes] = await Promise.all([
          movieApi.getPoolSize(),
          providerApi.list(),
        ]);
        setPoolSize(poolRes.data.size);
        const raw = provRes.data.providers as { id: number; name: string; logoUrl: string; displayPriority?: number }[];
        const seen = new Map<string, ProviderChip>();
        const idToBase = new Map<number, string>();
        const baseToId: ProviderIdMap = {};
        for (const p of raw) {
          const base = getBaseName(p.name);
          idToBase.set(p.id, base);
          const priority = p.displayPriority ?? 9999;
          const existing = seen.get(base);
          if (!existing || priority < existing.displayPriority) {
            seen.set(base, { name: base, logoUrl: p.logoUrl, displayPriority: priority });
            baseToId[base] = p.id;
          } else if (baseToId[base] == null) {
            baseToId[base] = p.id;
          }
        }
        setProviderIdByBase(baseToId);
        if (
          !localStorage.getItem('moviepicker_filters')
          && user?.preferredStreamingProviderIds
          && user.preferredStreamingProviderIds.length > 0
        ) {
          const names = Array.from(
            new Set(
              user.preferredStreamingProviderIds
                .map((id) => idToBase.get(id))
                .filter((n): n is string => !!n),
            ),
          );
          if (names.length > 0) {
            setFilters((prev) => (prev.streamingProviders && prev.streamingProviders.length > 0
              ? prev
              : { ...prev, streamingProviders: names }));
          }
        }
        const preferredRank = (name: string) => {
          const idx = PREFERRED_PROVIDERS.indexOf(name);
          return idx === -1 ? Infinity : idx;
        };
        const tier = (p: ProviderChip) => {
          if (PREFERRED_PROVIDERS.includes(p.name)) return 0;
          if (RENTAL_PROVIDERS.has(p.name)) return 2;
          return 1;
        };
        setStreamingProviders(
          Array.from(seen.values()).sort((a, b) => {
            const ta = tier(a);
            const tb = tier(b);
            if (ta !== tb) return ta - tb;
            if (ta === 0) return preferredRank(a.name) - preferredRank(b.name);
            return a.displayPriority - b.displayPriority;
          }),
        );
      } catch { /* ignore */ }
      finally { setPoolSizeLoading(false); }
    };
    run();
  }, [user]);

  useEffect(() => {
    if (!groupSessionId) return;
    connectSocket();
    const socket = getSocket();
    socket.emit('join-session', groupSessionId);

    socket.on('participant-joined', (data: Participant) => {
      setParticipants((prev) => [...prev, data]);
      addToast(`${data.displayName} joined!`);
    });

    return () => { socket.off('participant-joined'); };
  }, [groupSessionId, addToast]);

  useEffect(() => {
    if (!groupSessionId || !user || user.isGuest) return;
    friendsApi.list()
      .then((res) => setFriends(res.data.friends ?? []))
      .catch(() => { /* ignore */ });
  }, [groupSessionId, user]);

  const toggleFriend = (id: string) => {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleInviteFriends = async () => {
    if (!groupSessionId || selectedFriendIds.size === 0) return;
    const ids = Array.from(selectedFriendIds);
    setInviting(true);
    try {
      await friendsApi.inviteToSession(groupSessionId, ids);
      setInvitedFriendIds((prev) => new Set([...prev, ...ids]));
      setSelectedFriendIds(new Set());
      addToast(`Invited ${ids.length} friend${ids.length === 1 ? '' : 's'}`);
    } catch (err: unknown) {
      addToast(getErrorMessage(err, 'Failed to invite friends'));
    } finally {
      setInviting(false);
    }
  };

  const buildActiveFilters = useCallback((): Record<string, unknown> | undefined => {
    const active: Record<string, unknown> = {};
    if (filters.genres?.length > 0) active.genres = filters.genres;
    if (filters.decade) active.decade = filters.decade;
    if (filters.minRating > 0) active.minRating = filters.minRating;
    if (filters.maxRuntime > 0) active.maxRuntime = filters.maxRuntime;
    if (filters.streamingProviders?.length > 0) active.streamingProviders = filters.streamingProviders;
    return Object.keys(active).length > 0 ? active : undefined;
  }, [filters]);

  const handleCreateGroup = async () => {
    setSessionLoading(true);
    setSessionError('');
    try {
      const res = await sessionApi.createGroup(buildActiveFilters(), batchSize);
      setGroupSessionId(res.data.session.id);
      setShareLink(res.data.shareLink);
      setShortCode(res.data.shortCode ?? null);
      setParticipants([]);
    } catch (err: unknown) {
      setSessionError(getErrorMessage(err, 'Failed to create session'));
    } finally {
      setSessionLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setJoinCodeError('Enter a 6-character code');
      return;
    }
    setJoinCodeLoading(true);
    setJoinCodeError('');
    try {
      const res = await sessionApi.byCode(code);
      router.push(`/join/${res.data.sessionId}`);
    } catch (err: unknown) {
      setJoinCodeError(getErrorMessage(err, 'Invalid or expired code'));
    } finally {
      setJoinCodeLoading(false);
    }
  };

  const handleStartGroup = async () => {
    if (!groupSessionId) return;
    setStartLoading(true);
    setSessionError('');
    try {
      await sessionApi.startGroup(groupSessionId);
      router.push(`/session/${groupSessionId}`);
    } catch (err: unknown) {
      setSessionError(getErrorMessage(err, 'Failed to start session'));
    } finally {
      setStartLoading(false);
    }
  };

  const handleCancelGroup = async () => {
    if (!groupSessionId) return;
    try {
      await sessionApi.cancel(groupSessionId);
    } catch { /* ignore */ }
    setGroupSessionId(null);
    setShareLink(null);
    setShortCode(null);
    setParticipants([]);
    setSelectedFriendIds(new Set());
    setInvitedFriendIds(new Set());
    addToast('Session cancelled');
  };

  const startSoloSession = async (overrideFilters?: Record<string, unknown>) => {
    setSoloLoading(true);
    setSessionError('');
    try {
      const res = await soloApi.create(overrideFilters ?? buildActiveFilters(), batchSize);
      router.push(`/solo/${res.data.session.id}`);
    } catch (err: unknown) {
      setSessionError(getErrorMessage(err, 'Failed to start solo session'));
    } finally {
      setSoloLoading(false);
    }
  };

  const handleStartSolo = () => {
    startSoloSession();
  };

  const clearFilters = () => {
    setFilters({ genres: [], decade: '', minRating: 0, maxRuntime: 0, streamingProviders: [] });
  };

  const anyLoading = sessionLoading || soloLoading || startLoading;

  return (
    <motion.div
      key="swipe"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-4"
    >
      {/* Pool size */}
      <div className="glass rounded-2xl p-4">
        <p className="text-cream-dim text-sm">
          Your movie pool has{' '}
          <span className="text-danger font-semibold">{poolSizeLoading ? '...' : poolSize}</span> movies.
          {poolSize === 0 && !poolSizeLoading && ' Add some movies first from the Library tab.'}
        </p>
      </div>

      {/* Filters */}
      <FilterSummary
        filters={filters}
        open={showFilters}
        onEdit={() => setShowFilters(!showFilters)}
        onClear={clearFilters}
      />

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <FilterEditor
              filters={filters}
              onChange={setFilters}
              streamingProviders={streamingProviders}
              confirmedProviderNames={new Set(
                streamingProviders
                  .filter((p) => new Set(user?.preferredStreamingProviderIds ?? []).has(providerIdByBase[p.name]))
                  .map((p) => p.name),
              )}
              batchSize={batchSize}
              onBatchSizeChange={setBatchSize}
              providersExpanded={providersExpanded}
              onProvidersExpandedChange={setProvidersExpanded}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {sessionError && (
        <div className="p-3 glass rounded-xl border border-danger/30">
          <p className="text-danger text-sm text-center">{sessionError}</p>
        </div>
      )}

      {/* Lobby — shown once a group session is created */}
      <AnimatePresence>
        {groupSessionId && shareLink && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Waiting for friends</h3>
              <button
                onClick={handleCancelGroup}
                className="text-cream-dim text-xs hover:text-danger transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Share link */}
            <div>
              <p className="text-cream-dim text-xs mb-2">
                Share this link — they join with or without an account:
              </p>
              <div className="flex gap-2 items-center">
                <p className="flex-1 text-xs text-cream font-mono truncate bg-charcoal rounded-lg px-3 py-2">
                  {shareLink}
                </p>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { navigator.clipboard.writeText(shareLink); addToast('Link copied!'); }}
                  className="px-3 py-2 bg-coral text-charcoal text-xs font-semibold rounded-lg shrink-0"
                >
                  Copy
                </motion.button>
              </div>
            </div>

            {/* Short code */}
            {shortCode && (
              <div>
                <p className="text-cream-dim text-xs mb-2">
                  Or enter this code on the Join screen:
                </p>
                <div className="flex gap-2 items-center">
                  <p className="flex-1 text-center text-2xl font-bold tracking-[0.3em] text-coral font-mono bg-charcoal rounded-lg px-3 py-3">
                    {shortCode}
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { navigator.clipboard.writeText(shortCode); addToast('Code copied!'); }}
                    className="px-3 py-2 bg-coral text-charcoal text-xs font-semibold rounded-lg shrink-0"
                  >
                    Copy
                  </motion.button>
                </div>
              </div>
            )}

            {/* QR code */}
            {shareLink && (
              <div className="flex flex-col items-center gap-2 pt-1">
                <p className="text-cream-dim text-xs">Or scan to join:</p>
                <div className="bg-cream p-2.5 rounded-xl">
                  <QRCodeSVG value={shareLink} size={140} level="M" />
                </div>
              </div>
            )}

            {/* Invite friends */}
            {user && !user.isGuest && friends.length > 0 && (
              <div>
                <p className="text-cream-dim text-xs mb-2">Invite a friend:</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {friends.map((f) => {
                    const selected = selectedFriendIds.has(f.id);
                    const invited = invitedFriendIds.has(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => !invited && toggleFriend(f.id)}
                        disabled={invited}
                        className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                          invited
                            ? 'bg-coral/20 text-cream-dim cursor-default'
                            : selected
                              ? 'bg-coral text-charcoal'
                              : 'glass text-cream-dim hover:text-cream'
                        }`}
                      >
                        {f.username}
                        {invited ? ' ✓' : ''}
                      </button>
                    );
                  })}
                </div>
                {selectedFriendIds.size > 0 && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleInviteFriends}
                    disabled={inviting}
                    className="w-full py-2 bg-coral/80 text-charcoal text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    {inviting ? 'Sending…' : `Invite ${selectedFriendIds.size} friend${selectedFriendIds.size === 1 ? '' : 's'}`}
                  </motion.button>
                )}
              </div>
            )}

            {/* Participant list */}
            <div>
              <p className="text-cream-dim text-xs mb-2">
                {participants.length === 0
                  ? 'No one has joined yet...'
                  : `${participants.length} joined:`}
              </p>
              <div className="flex flex-wrap gap-2">
                {participants.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-charcoal rounded-full"
                  >
                    <div className="w-2 h-2 rounded-full bg-coral" />
                    <span className="text-cream text-xs">{p.displayName}</span>
                    {p.type === 'registered' && (
                      <span className="text-cream-dim text-xs">(watchlist merged)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Start button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartGroup}
              disabled={startLoading}
              className="w-full py-3 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors disabled:opacity-50"
            >
              {startLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" /> Building movie pool...
                </span>
              ) : participants.length === 0
                ? 'Start Solo (just me)'
                : `Start Swiping (${participants.length + 1} people)`}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary action buttons — hidden while lobby is open */}
      {!groupSessionId && (
        <div className="space-y-3">
          {poolSize === 0 && !poolSizeLoading && (
            <p className="text-center text-xs text-cream-dim">
              Library is empty — Solo and Watch Together need your library. Head to Browse to discover by filters.
            </p>
          )}
          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartSolo}
              disabled={anyLoading || poolSize === 0 || poolSizeLoading}
              className="flex-1 py-4 bg-coral text-charcoal font-semibold rounded-xl text-base hover:bg-coral-dark transition-all shadow-md hover:shadow-coral/40 disabled:opacity-50"
            >
              {soloLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" /> Starting...
                </span>
              ) : 'Solo'}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCreateGroup}
              disabled={anyLoading || poolSize === 0 || poolSizeLoading}
              className="flex-1 py-4 glass text-danger font-semibold rounded-xl text-base outline outline-1 outline-coral hover:bg-card-hover transition-all btn-glow disabled:opacity-50"
            >
              {sessionLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" /> Creating...
                </span>
              ) : 'Together'}
            </motion.button>
          </div>

          {/* Join by code */}
          <div className="glass rounded-2xl p-4 space-y-2">
            <p className="text-cream-dim text-xs">Got a code from a friend?</p>
            <div className="flex gap-2 items-stretch">
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={joinCodeInput}
                onChange={(e) => { setJoinCodeInput(e.target.value.toUpperCase().slice(0, 6)); setJoinCodeError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleJoinByCode(); }}
                placeholder="ABC123"
                maxLength={6}
                className="flex-1 min-w-0 bg-charcoal border border-card-hover rounded-xl px-3 py-2.5 text-center text-base font-mono tracking-[0.2em] text-cream placeholder-cream-dim/40 focus:outline-none focus:border-coral"
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleJoinByCode}
                disabled={joinCodeLoading || joinCodeInput.length !== 6}
                className="px-4 bg-coral text-charcoal text-sm font-semibold rounded-xl shrink-0 hover:bg-coral-dark transition-colors disabled:opacity-50"
              >
                {joinCodeLoading ? '…' : 'Join'}
              </motion.button>
            </div>
            {joinCodeError && <p className="text-danger text-xs">{joinCodeError}</p>}
          </div>
        </div>
      )}

    </motion.div>
  );
}
