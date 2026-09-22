import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'Invalid token' || err.message === 'Authentication required') {
        console.error('Socket auth failed:', err.message);
        socket?.disconnect();
      }
    });
  }
  return socket;
}

/**
 * Connect with the current token. If the token changed since the socket last
 * authenticated (login, logout, joining as a guest), reconnect so the server
 * re-authenticates us instead of keeping the previous identity's rooms.
 * Reuses the same Socket instance, so listeners registered by components survive.
 */
export function connectSocket(): void {
  const s = getSocket();
  const token = localStorage.getItem('token');
  const current = (s.auth as { token?: string | null } | undefined)?.token ?? null;
  if (s.connected || s.active) {
    if (current === token) return;
    s.disconnect();
  }
  s.auth = { token };
  s.connect();
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
