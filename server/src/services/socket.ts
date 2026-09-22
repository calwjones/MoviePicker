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
const MAX_ROULETTE_ITEMS = 500;

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

    if (socket.userId && socket.userId !== 'guest') {
      socket.join(`user:${socket.userId}`);
    }

    socket.on('join-session', async (sessionId: unknown) => {
      if (typeof sessionId !== 'string' || sessionId.length > 64) return;
      try {
        const session = await prisma.swipeSession.findUnique({
          where: { id: sessionId },
          include: { participants: true },
        });
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

        if (session.type === 'solo') {
          if (session.userId !== socket.userId) {
            socket.emit('error', { message: 'Not authorized for this session' });
            return;
          }
          socket.join(`session:${sessionId}`);
          emitRouletteState();
          return;
        }

        const participant = session.participants.find((p) => {
          if (p.leftAt) return false;
          if (socket.guestId) return p.guestToken === socket.guestId;
          return p.userId === socket.userId;
        });

        if (!participant) {
          socket.emit('error', { message: 'Not authorized for this session' });
          return;
        }

        socket.join(`session:${sessionId}`);
        if (!participant.isHost) {
          socket.to(`session:${sessionId}`).emit('partner-online');
          if (!alreadyAnnounced) {
            announcedJoins.add(joinedKey);
            socket.to(`session:${sessionId}`).emit('participant-joined', {
              displayName: participant.displayName,
              type: socket.guestId ? 'guest' : 'registered',
            });
          }
        }
        const activeCount = session.participants.filter((p) => !p.leftAt).length;
        io.to(`session:${sessionId}`).emit('participant-count', { count: activeCount });
        emitRouletteState();
      } catch {
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // Every handler below takes client-supplied data: validate its shape and
    // never let a throw escape into socket.io (an uncaught throw here takes the
    // whole process down).
    const guard = <T>(event: string, handler: (data: T) => void) => {
      socket.on(event, (data: unknown) => {
        try {
          handler((data && typeof data === 'object' ? data : {}) as T);
        } catch (err) {
          console.error(`[socket] ${event} handler failed`, err);
        }
      });
    };
    const inSession = (sessionId: unknown): sessionId is string =>
      typeof sessionId === 'string' && socket.rooms.has(`session:${sessionId}`);

    guard<{ sessionId?: unknown }>('done-swiping', ({ sessionId }) => {
      if (!inSession(sessionId)) return;
      socket.to(`session:${sessionId}`).emit('partner-done');
    });

    guard<{ sessionId?: unknown }>('reveal-matches', ({ sessionId }) => {
      if (!inSession(sessionId)) return;
      io.to(`session:${sessionId}`).emit('matches-revealed');
    });

    guard<{ sessionId?: unknown }>('reveal-all', ({ sessionId }) => {
      if (!inSession(sessionId)) return;
      io.to(`session:${sessionId}`).emit('matches-reveal-all');
    });

    guard<{ sessionId?: unknown; excludedIds?: unknown }>('roulette-open', ({ sessionId, excludedIds }) => {
      if (!inSession(sessionId)) return;
      const ids = Array.isArray(excludedIds)
        ? excludedIds.filter((id): id is string => typeof id === 'string' && id.length <= 64).slice(0, MAX_ROULETTE_ITEMS)
        : [];
      io.to(`session:${sessionId}`).emit('roulette-opened', { excludedIds: ids });
    });

    guard<{ sessionId?: unknown }>('roulette-close', ({ sessionId }) => {
      if (!inSession(sessionId)) return;
      io.to(`session:${sessionId}`).emit('roulette-closed');
    });

    guard<{ sessionId?: unknown; matchCount?: unknown }>('roulette-spin', ({ sessionId, matchCount }) => {
      // matchCount comes from the client: an unbounded value used to size an
      // array here, so one message could exhaust the heap and kill the server.
      if (typeof matchCount !== 'number' || !Number.isInteger(matchCount) || matchCount <= 0 || matchCount > MAX_ROULETTE_ITEMS) return;
      if (!inSession(sessionId)) {
        socket.emit('roulette-error', { message: 'Not in session' });
        return;
      }

      const state = rouletteSpins.get(sessionId) ?? { count: 0, lastWinner: null };
      if (state.count >= MAX_SPINS) {
        socket.emit('roulette-error', { message: 'No spins left', spinsLeft: 0 });
        return;
      }

      // Uniform pick that never repeats the previous winner (when there's a choice).
      const avoid = state.lastWinner !== null && state.lastWinner < matchCount && matchCount > 1 ? state.lastWinner : null;
      let winnerIndex = Math.floor(Math.random() * (avoid === null ? matchCount : matchCount - 1));
      if (avoid !== null && winnerIndex >= avoid) winnerIndex++;

      rouletteSpins.set(sessionId, { count: state.count + 1, lastWinner: winnerIndex });
      const spinsLeft = MAX_SPINS - (state.count + 1);

      io.to(`session:${sessionId}`).emit('roulette-result', { winnerIndex, spinsLeft });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });
  });
}
