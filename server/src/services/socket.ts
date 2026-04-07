import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { prisma } from '../app';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  guestId?: string;
}

interface RouletteState {
  count: number;
  lastWinner: number | null;
}

const rouletteSpins = new Map<string, RouletteState>();
const announcedJoins = new Set<string>();
const MAX_SPINS = 3;

export function clearSessionState(sessionId: string): void {
  rouletteSpins.delete(sessionId);
  for (const key of announcedJoins) {
    if (key.startsWith(`${sessionId}:`)) announcedJoins.delete(key);
  }
}

export function setupSocketHandlers(io: Server): void {
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string; guestId?: string };
      if (decoded.guestId) {
        socket.guestId = decoded.guestId;
        socket.userId = 'guest';
      } else {
        socket.userId = decoded.userId;
      }
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.userId}`);

    socket.on('join-session', async (sessionId: string) => {
      try {
        const session = await prisma.swipeSession.findUnique({ where: { id: sessionId } });
        if (!session) {
          socket.emit('error', { message: 'Not authorized for this session' });
          return;
        }

        const userKey = socket.guestId ? `guest:${socket.guestId}` : `user:${socket.userId}`;
        const joinedKey = `${sessionId}:${userKey}`;
        const alreadyAnnounced = announcedJoins.has(joinedKey);

        const emitRouletteState = () => {
          const count = rouletteSpins.get(sessionId)?.count ?? 0;
          socket.emit('roulette-state', {
            spinsLeft: Math.max(0, MAX_SPINS - count),
            maxSpins: MAX_SPINS,
          });
        };

        if (socket.guestId && session.guestId === socket.guestId) {
          socket.join(`session:${sessionId}`);
          socket.to(`session:${sessionId}`).emit('partner-online');
          if (!alreadyAnnounced) {
            announcedJoins.add(joinedKey);
            socket.to(`session:${sessionId}`).emit('participant-joined', {
              displayName: session.guestName ?? 'Guest',
              type: 'guest',
            });
          }
          emitRouletteState();
          return;
        }

        if (session.type === 'solo' && session.userId === socket.userId) {
          socket.join(`session:${sessionId}`);
          emitRouletteState();
          return;
        }

        if (session.type === 'group') {
          const isHost = session.userId === socket.userId;
          const isUser2 = session.user2Id === socket.userId;
          if (!isHost && !isUser2) {
            socket.emit('error', { message: 'Not authorized for this session' });
            return;
          }
          socket.join(`session:${sessionId}`);
          if (!isHost) {
            socket.to(`session:${sessionId}`).emit('partner-online');
            if (!alreadyAnnounced) {
              announcedJoins.add(joinedKey);
              const joiner = await prisma.user.findUnique({
                where: { id: socket.userId },
                select: { displayName: true },
              });
              socket.to(`session:${sessionId}`).emit('participant-joined', {
                displayName: joiner?.displayName ?? 'Player',
                type: 'registered',
              });
            }
          }
          emitRouletteState();
          return;
        }

        socket.emit('error', { message: 'Not authorized for this session' });
      } catch {
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    socket.on('done-swiping', (data: { sessionId: string }) => {
      socket.to(`session:${data.sessionId}`).emit('partner-done');
    });

    socket.on('reveal-matches', (data: { sessionId: string }) => {
      const { sessionId } = data;
      if (!sessionId || !socket.rooms.has(`session:${sessionId}`)) return;
      io.to(`session:${sessionId}`).emit('matches-revealed');
    });

    socket.on('reveal-all', (data: { sessionId: string }) => {
      const { sessionId } = data;
      if (!sessionId || !socket.rooms.has(`session:${sessionId}`)) return;
      io.to(`session:${sessionId}`).emit('matches-reveal-all');
    });

    socket.on('roulette-spin', (data: { sessionId: string; matchCount: number }) => {
      const { sessionId, matchCount } = data;
      if (!sessionId || !matchCount || matchCount <= 0) return;

      if (!socket.rooms.has(`session:${sessionId}`)) {
        socket.emit('roulette-error', { message: 'Not in session' });
        return;
      }

      const state = rouletteSpins.get(sessionId) ?? { count: 0, lastWinner: null };
      if (state.count >= MAX_SPINS) {
        socket.emit('roulette-error', { message: 'No spins left', spinsLeft: 0 });
        return;
      }

      const eligible = state.lastWinner !== null && matchCount > 1
        ? Array.from({ length: matchCount }, (_, i) => i).filter((i) => i !== state.lastWinner)
        : Array.from({ length: matchCount }, (_, i) => i);
      const winnerIndex = eligible[Math.floor(Math.random() * eligible.length)];

      rouletteSpins.set(sessionId, { count: state.count + 1, lastWinner: winnerIndex });
      const spinsLeft = MAX_SPINS - (state.count + 1);

      io.to(`session:${sessionId}`).emit('roulette-result', { winnerIndex, spinsLeft });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });
  });
}
