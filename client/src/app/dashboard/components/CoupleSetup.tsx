'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { coupleApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import ConfirmModal from '@/components/ConfirmModal';
import type { Couple } from '@shared/types';

interface CoupleSetupProps {
  couple: Couple | null;
  onCoupleChange: (couple: Couple | null) => void;
  addToast: (message: string) => void;
}

export default function CoupleSetup({ couple, onCoupleChange, addToast }: CoupleSetupProps) {
  const [inviteInput, setInviteInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isPaired = !!couple?.user2;

  const handleCreateCouple = async () => {
    try {
      const res = await coupleApi.create();
      onCoupleChange(res.data.couple);
    } catch (err: unknown) {
      addToast(getErrorMessage(err, 'Failed to create group'));
    }
  };

  const handleJoinCouple = async () => {
    if (!inviteInput.trim()) return;
    try {
      const res = await coupleApi.join(inviteInput.trim());
      onCoupleChange(res.data.couple);
    } catch (err: unknown) {
      addToast(getErrorMessage(err, 'Failed to join group'));
    }
  };

  const handleLeaveCouple = async () => {
    try {
      await coupleApi.leave();
      onCoupleChange(null);
      setShowLeaveConfirm(false);
    } catch {
      addToast('Failed to leave group');
    }
  };

  const handleCopyCode = () => {
    if (!couple) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(couple.inviteCode);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = couple.inviteCode;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Paired banner — compact
  if (isPaired) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-4 mb-6 flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-coral flex items-center justify-center text-charcoal font-bold text-sm">
            {couple!.user1.displayName[0]}
          </div>
          <span className="text-danger">&amp;</span>
          <div className="w-8 h-8 rounded-full bg-coral flex items-center justify-center text-charcoal font-bold text-sm">
            {couple!.user2!.displayName[0]}
          </div>
          <span className="text-cream-dim text-sm ml-auto">Grouped</span>
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="text-cream-dim text-xs hover:text-danger transition-colors"
          >
            Leave
          </button>
        </motion.div>

        <ConfirmModal
          open={showLeaveConfirm}
          onClose={() => setShowLeaveConfirm(false)}
          onConfirm={handleLeaveCouple}
          title="Leave Group?"
          description="This will unpair you from your partner. Your watchlist will remain."
          confirmLabel="Leave"
          cancelLabel="Cancel"
          danger
        />
      </>
    );
  }

  // Not paired — collapsible setup
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl mb-6 overflow-hidden"
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center">
              <svg className="w-4 h-4 text-cream-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Group Up</p>
              <p className="text-cream-dim text-xs">Pair with someone for group sessions</p>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-cream-dim transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                {couple ? (
                  <div>
                    <p className="text-cream-dim text-sm mb-3">Share this code with your partner:</p>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 py-2.5 px-4 bg-charcoal rounded-xl text-center text-xl font-mono tracking-widest text-danger">
                        {couple.inviteCode}
                      </div>
                      <button
                        onClick={handleCopyCode}
                        className="py-2.5 px-4 glass rounded-xl text-cream-dim hover:text-cream transition-colors text-sm"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-cream-dim text-xs">Waiting for partner to join...</p>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleCreateCouple}
                      className="w-full py-2.5 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors text-sm"
                    >
                      Create Invite Code
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-card" />
                      <span className="text-cream-dim text-xs">or</span>
                      <div className="flex-1 h-px bg-card" />
                    </div>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        placeholder="Enter invite code"
                        value={inviteInput}
                        onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                        className="flex-1 px-4 py-2.5 glass rounded-xl bg-transparent text-cream placeholder:text-cream-dim focus:outline-none focus:ring-2 focus:ring-coral font-mono tracking-widest text-center text-sm"
                        maxLength={8}
                      />
                      <button
                        onClick={handleJoinCouple}
                        className="py-2.5 px-5 bg-coral text-charcoal font-semibold rounded-xl hover:bg-coral-dark transition-colors text-sm"
                      >
                        Join
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <ConfirmModal
        open={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeaveCouple}
        title="Leave Group?"
        description="This will unpair you from your partner. Your watchlist will remain."
        confirmLabel="Leave"
        cancelLabel="Cancel"
        danger
      />
    </>
  );
}
