jest.mock('socket.io-client', () => {
  const mockSocket = {
    connected: false,
    auth: {},
    connect: jest.fn(function (this: { connected: boolean }) {
      this.connected = true;
    }),
    disconnect: jest.fn(function (this: { connected: boolean }) {
      this.connected = false;
    }),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  };
  return {
    io: jest.fn(() => mockSocket),
  };
});

// Import after mocking
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('Socket Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  it('getSocket should return a socket instance', () => {
    const socket = getSocket();
    expect(socket).toBeDefined();
    expect(socket.on).toBeDefined();
    expect(socket.emit).toBeDefined();
  });

  it('getSocket should return the same instance on multiple calls', () => {
    const socket1 = getSocket();
    const socket2 = getSocket();
    expect(socket1).toBe(socket2);
  });

  it('connectSocket should connect the socket', () => {
    localStorageMock.setItem('token', 'test-token');
    connectSocket();
    const socket = getSocket();
    expect(socket.connect).toHaveBeenCalled();
  });

  it('disconnectSocket should disconnect and nullify', () => {
    const socket = getSocket();
    disconnectSocket();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
