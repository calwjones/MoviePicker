'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
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

  const isPaired = !!couple?.user2;

  const handleCreateCouple = async () => {
    try {
      const res = await coupleApi.create();
      onCoupleChange(res.data.couple);
    } catch (err: unknown) {
      addToast(getErrorMessage(err, 'Failed to create couple'));
    }
  };

  const handleJoinCouple = async () => {
    if (!inviteInput.trim()) return;
    try {
      const res = await coupleApi.join(inviteInput.trim());
      onCoupleChange(res.data.couple);
    } catch (err: unknown) {
      addToast(getErrorMessage(err, 'Failed to join couple'));
    }
  };

  const handleLeaveCouple = async () => {
    try {
      await coupleApi.leave();
      onCoupleChange(null);
      setShowLeaveConfirm(false);
    } catch {
      addToast('Failed to leave couple');
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

  return (
    <>
      {/* Pair Up section — shown when not paired */}
      {!isPaired && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-6 mb-6"
        >
          <h2 className="text-xl font-semibold mb-2 font-display">
            Pair Up
          </h2>
          <p className="text-cream-dim text-sm mb-4">
            Pair with your partner to start swiping together. You can build your watchlist while you wait.
          </p>

          {couple ? (
            <div>
              <p className="text-cream-dim mb-3">Share this code with your partner:</p>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 py-3 px-4 bg-charcoal rounded-xl text-center text-2xl font-mono tracking-widest text-amber">
                  {couple.inviteCode}
                </div>
                <button
                  onClick={handleCopyCode}
                  className="py-3 px-4 glass rounded-xl text-cream-dim hover:text-cream transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-cream-dim text-sm">Waiting for your partner to join...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <button
                onClick={handleCreateCouple}
                className="w-full py-3 bg-amber text-charcoal font-semibold rounded-xl hover:bg-amber-dark transition-colors"
              >
                Create Invite Code
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-card" />
                <span className="text-cream-dim text-sm">or</span>
                <div className="flex-1 h-px bg-card" />
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Enter invite code"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                  className="flex-1 px-4 py-3 glass rounded-xl bg-transparent text-cream placeholder:text-cream-dim focus:outline-none focus:ring-2 focus:ring-amber font-mono tracking-widest text-center"
                  maxLength={8}
                />
                <button
                  onClick={handleJoinCouple}
                  className="py-3 px-6 bg-amber text-charcoal font-semibold rounded-xl hover:bg-amber-dark transition-colors"
                >
                  Join
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Paired banner */}
      {isPaired && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-4 mb-6 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-amber flex items-center justify-center text-charcoal font-bold">
            {couple!.user1.displayName[0]}
          </div>
          <span className="text-coral text-lg">&amp;</span>
          <div className="w-10 h-10 rounded-full bg-coral flex items-center justify-center text-charcoal font-bold">
            {couple!.user2!.displayName[0]}
          </div>
          <span className="text-cream-dim text-sm ml-auto">Paired</span>
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="text-cream-dim text-xs hover:text-coral transition-colors"
          >
            Leave
          </button>
        </motion.div>
      )}

      {/* Leave confirmation modal */}
      <ConfirmModal
        open={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeaveCouple}
        title="Leave Couple?"
        description="This will unpair you from your partner. Your watchlist will remain."
        confirmLabel="Leave"
        cancelLabel="Cancel"
        danger
      />
    </>
  );
}
