import { createServer } from 'http';
import { Server } from 'socket.io';
import app, { prisma } from './app';
import { setupSocketHandlers } from './services/socket';
import { setIO } from './services/emitter';
import { CLIENT_URL, PORT } from './config';

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

setupSocketHandlers(io);
setIO(io);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);
  httpServer.close(async () => {
    await prisma.$disconnect();
    console.log('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { prisma, io };
