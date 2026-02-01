import type { AuthRequest } from '../middleware/auth';

interface SessionWithCouple {
  type: string;
  userId: string | null;
  guestId: string | null;
  couple?: { user1Id: string; user2Id: string | null } | null;
}

interface SessionRole {
  isSolo: boolean;
  isGuest: boolean;
  isUser1: boolean;
  isUser2: boolean;
}

export function resolveSessionRole(req: AuthRequest, session: SessionWithCouple): SessionRole {
  const isSolo = session.type === 'solo';
  const isGuest = !!(req.isGuest && session.guestId === req.guestId);

  let isUser1: boolean;
  let isUser2: boolean;

  if (isSolo) {
    isUser1 = session.userId === req.userId;
    isUser2 = false;
  } else if (session.type === 'guest') {
    // Guest-type sessions: creator is user1, guest is user2
    isUser1 = !!(session.userId && session.userId === req.userId);
    isUser2 = isGuest;
  } else {
    // Couple-type sessions
    isUser1 = !isGuest && !!session.couple?.user1Id && session.couple.user1Id === req.userId;
    isUser2 = isGuest || !!session.couple?.user2Id && session.couple.user2Id === req.userId;
  }

  return { isSolo, isGuest, isUser1, isUser2 };
}
