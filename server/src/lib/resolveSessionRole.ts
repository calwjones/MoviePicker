import { prisma } from '../app';
import type { AuthRequest } from '../middleware/auth';

interface ParticipantLite {
  id: string;
  userId: string | null;
  guestToken: string | null;
  isHost: boolean;
  leftAt: Date | null;
}

interface SessionWithParticipants {
  id?: string;
  type: string;
  userId: string | null;
  guestId?: string | null;
  participants?: ParticipantLite[];
}

export interface SessionRole {
  isSolo: boolean;
  isGuest: boolean;
  isUser1: boolean;
  isUser2: boolean;
  participantId: string | null;
}

export async function resolveSessionRole(
  req: AuthRequest,
  session: SessionWithParticipants,
): Promise<SessionRole> {
  const isSolo = session.type === 'solo';
  const isGuest = !!req.isGuest;

  if (isSolo) {
    return {
      isSolo: true,
      isGuest: false,
      isUser1: session.userId === req.userId,
      isUser2: false,
      participantId: null,
    };
  }

  let participants = session.participants;
  if (!participants && session.id) {
    participants = await prisma.sessionParticipant.findMany({
      where: { sessionId: session.id },
      select: { id: true, userId: true, guestToken: true, isHost: true, leftAt: true },
    });
  }

  let isUser1 = false;
  let isUser2 = false;
  let participantId: string | null = null;

  for (const p of participants ?? []) {
    if (p.leftAt !== null) continue;
    const matchesUser = !isGuest && !!p.userId && p.userId === req.userId;
    const matchesGuest = isGuest && !!p.guestToken && p.guestToken === req.guestId;
    if (matchesUser || matchesGuest) {
      participantId = p.id;
      if (p.isHost) isUser1 = true;
      else isUser2 = true;
      break;
    }
  }

  return { isSolo: false, isGuest, isUser1, isUser2, participantId };
}
