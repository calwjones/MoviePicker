export const SocketEvents = {
  JoinSession: 'join-session',
  DoneSwiping: 'done-swiping',
  RevealMatches: 'reveal-matches',
  RevealAll: 'reveal-all',
  RouletteOpen: 'roulette-open',
  RouletteClose: 'roulette-close',
  RouletteSpin: 'roulette-spin',
  PartnerOnline: 'partner-online',
  ParticipantJoined: 'participant-joined',
  SwipeUpdate: 'swipe-update',
  SessionStarted: 'session-started',
  SessionComplete: 'session-complete',
  NewBatch: 'new-batch',
  PartnerDone: 'partner-done',
  MatchesRevealed: 'matches-revealed',
  MatchesRevealAll: 'matches-reveal-all',
  RouletteOpened: 'roulette-opened',
  RouletteClosed: 'roulette-closed',
  RouletteResult: 'roulette-result',
  RouletteState: 'roulette-state',
  RouletteError: 'roulette-error',
  Error: 'error',
  FriendRequest: 'friend-request',
  FriendRequestAccepted: 'friend-request-accepted',
  SessionInvite: 'session-invite',
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

export interface SwipeUpdatePayload {
  movieId: string;
  isMatch: boolean;
  progress: number;
  swiped: number;
  total: number;
  participantId: string;
}

export interface SessionInvitePayload {
  inviteId: string;
  sessionId: string;
  hostName: string;
}

export interface FriendRequestPayload {
  friendshipId: string;
  from: { id: string; username: string; avatarUrl?: string };
}

export interface RouletteResultPayload {
  winnerIndex: number;
  spinsLeft: number;
}

export interface PartnerDonePayload {
  finishedByRole: 'host' | 'participant';
  participantId: string;
}
