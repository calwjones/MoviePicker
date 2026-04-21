'use client';

import { motion } from 'framer-motion';

export interface PresenceParticipant {
  id: string;
  displayName: string;
  isHost: boolean;
  online: boolean;
}

interface PresenceRowProps {
  participants: PresenceParticipant[];
  max?: number;
}

export default function PresenceRow({ participants, max = 4 }: PresenceRowProps) {
  if (participants.length === 0) return null;
  const visible = participants.slice(0, max);
  const overflow = participants.length - visible.length;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((p) => {
        const initial = p.displayName.charAt(0).toUpperCase() || '?';
        return (
          <div key={p.id} className="relative" title={`${p.displayName}${p.isHost ? ' (host)' : ''}`}>
            <div
              className={`w-7 h-7 rounded-full bg-coral/20 ring-2 flex items-center justify-center text-coral text-[11px] font-semibold ${
                p.online ? 'ring-coral' : 'ring-charcoal/60'
              }`}
            >
              {initial}
            </div>
            {p.online && (
              <motion.span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-charcoal"
                initial={{ scale: 0.8 }}
                animate={{ scale: [0.8, 1.1, 0.8] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="w-7 h-7 rounded-full bg-charcoal/80 ring-2 ring-charcoal/60 flex items-center justify-center text-cream-dim text-[10px] font-semibold">
          +{overflow}
        </div>
      )}
    </div>
  );
}
