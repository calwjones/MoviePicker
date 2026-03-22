import type { AuthRequest } from '../middleware/auth';

interface SessionWithParticipants {
  type: string;
  userId: string | null;
  user2Id?: string | null;
  guestId: string | null;
}

interface SessionRole {
  isSolo: boolean;
  isGuest: boolean;
  isUser1: boolean;
  isUser2: boolean;
}

export function resolveSessionRole(req: AuthRequest, session: SessionWithParticipants): SessionRole {
  const isSolo = session.type === 'solo';
  const isGuest = !!(req.isGuest && session.guestId === req.guestId);

  let isUser1: boolean;
  let isUser2: boolean;

  if (isSolo) {
    isUser1 = session.userId === req.userId;
    isUser2 = false;
  } else {
    isUser1 = !!(session.userId && session.userId === req.userId);
    isUser2 = isGuest || !!(session.user2Id && session.user2Id === req.userId);
  }

  return { isSolo, isGuest, isUser1, isUser2 };
}
