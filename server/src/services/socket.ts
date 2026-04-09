import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { prisma } from '../app';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  guestId?: string;
}

const rouletteSpins = new Map<string, number>();
const MAX_SPINS = 3;

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

        if (socket.guestId && session.guestId === socket.guestId) {
          socket.join(`session:${sessionId}`);
          socket.to(`session:${sessionId}`).emit('partner-online');
          return;
        }

        if (session.type === 'solo' && session.userId === socket.userId) {
          socket.join(`session:${sessionId}`);
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
          if (!isHost) socket.to(`session:${sessionId}`).emit('partner-online');
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

    socket.on('roulette-spin', (data: { sessionId: string; matchCount: number }) => {
      const { sessionId, matchCount } = data;
      if (!sessionId || !matchCount || matchCount <= 0) return;

      if (!socket.rooms.has(`session:${sessionId}`)) {
        socket.emit('roulette-error', { message: 'Not in session' });
        return;
      }

      const currentSpins = rouletteSpins.get(sessionId) || 0;
      if (currentSpins >= MAX_SPINS) {
        socket.emit('roulette-error', { message: 'No spins left' });
        return;
      }

      rouletteSpins.set(sessionId, currentSpins + 1);
      const spinsLeft = MAX_SPINS - (currentSpins + 1);
      const winnerIndex = Math.floor(Math.random() * matchCount);

      io.to(`session:${sessionId}`).emit('roulette-result', { winnerIndex, spinsLeft });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });
  });
}
