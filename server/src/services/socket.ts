import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { prisma } from '../app';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function setupSocketHandlers(io: Server): void {
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.userId = decoded.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.userId}`);

    socket.on('join-session', async (sessionId: string) => {
      try {
        const session = await prisma.swipeSession.findUnique({
          where: { id: sessionId },
          include: { couple: true },
        });
        if (!session || (session.couple.user1Id !== socket.userId && session.couple.user2Id !== socket.userId)) {
          socket.emit('error', { message: 'Not authorized for this session' });
          return;
        }
        socket.join(`session:${sessionId}`);
        socket.to(`session:${sessionId}`).emit('partner-online');
        console.log(`User ${socket.userId} joined session ${sessionId}`);
      } catch {
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    socket.on('join-couple', async (coupleId: string) => {
      try {
        const couple = await prisma.couple.findUnique({ where: { id: coupleId } });
        if (!couple || (couple.user1Id !== socket.userId && couple.user2Id !== socket.userId)) {
          socket.emit('error', { message: 'Not authorized for this couple' });
          return;
        }
        socket.join(`couple:${coupleId}`);
        console.log(`User ${socket.userId} joined couple room ${coupleId}`);
      } catch {
        socket.emit('error', { message: 'Failed to join couple room' });
      }
    });

    socket.on('done-swiping', (data: { sessionId: string }) => {
      socket.to(`session:${data.sessionId}`).emit('partner-done');
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });
  });
}
