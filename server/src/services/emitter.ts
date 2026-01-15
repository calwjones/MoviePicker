import { Server } from 'socket.io';

let io: Server | null = null;

export function setIO(server: Server): void {
  io = server;
}

export function emit(room: string, event: string, data: unknown): void {
  if (io) {
    io.to(room).emit(event, data);
  }
}
