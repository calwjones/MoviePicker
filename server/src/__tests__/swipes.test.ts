import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import mockPrisma from '../__mocks__/prisma';

jest.mock('../app', () => {
  const actual = jest.requireActual('../app');
  return {
    __esModule: true,
    default: actual.default,
    prisma: require('../__mocks__/prisma').default,
  };
});

jest.mock('../services/pushSender', () => ({ sendPush: jest.fn() }));

const prisma = mockPrisma as unknown as {
  swipeSession: { findUnique: jest.Mock };
  sessionMovie: { findUnique: jest.Mock; update: jest.Mock; count: jest.Mock };
  sessionSwipe: { upsert: jest.Mock; count: jest.Mock };
  match: { upsert: jest.Mock; deleteMany: jest.Mock };
};
prisma.sessionSwipe = { upsert: jest.fn(), count: jest.fn() };

const token = jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET as string);

function groupSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    type: 'group',
    status: 'swiping',
    userId: 'u1',
    participants: [
      { id: 'p1', userId: 'u1', guestToken: null, isHost: true, leftAt: null },
      { id: 'p2', userId: 'u2', guestToken: null, isHost: false, leftAt: null },
      { id: 'p3', userId: 'u3', guestToken: null, isHost: false, leftAt: new Date() },
    ],
    ...overrides,
  };
}

function swipe(body: Record<string, unknown>) {
  return request(app).post('/api/swipes').set('Authorization', `Bearer ${token}`).send(body);
}

describe('POST /api/swipes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sessionMovie.findUnique.mockResolvedValue({ id: 'sm1' });
    prisma.sessionMovie.count.mockResolvedValue(10);
    prisma.sessionSwipe.count.mockResolvedValue(0);
  });

  it('rejects non-string ids', async () => {
    const res = await swipe({ sessionId: { $ne: 1 }, movieId: 'm1', direction: 'right' });
    expect(res.status).toBe(400);
  });

  it('rejects swipes on a finished session', async () => {
    prisma.swipeSession.findUnique.mockResolvedValue(groupSession({ status: 'completed' }));
    const res = await swipe({ sessionId: 's1', movieId: 'm1', direction: 'right' });
    expect(res.status).toBe(409);
    expect(prisma.sessionSwipe.upsert).not.toHaveBeenCalled();
  });

  it('rejects movies that are not in the session deck', async () => {
    prisma.swipeSession.findUnique.mockResolvedValue(groupSession());
    prisma.sessionMovie.findUnique.mockResolvedValue(null);
    const res = await swipe({ sessionId: 's1', movieId: 'not-in-deck', direction: 'right' });
    expect(res.status).toBe(404);
    expect(prisma.sessionSwipe.upsert).not.toHaveBeenCalled();
  });

  it('matches once every active participant has liked it, ignoring people who left', async () => {
    prisma.swipeSession.findUnique.mockResolvedValue(groupSession());
    prisma.sessionSwipe.count
      .mockResolvedValueOnce(2) // right swipes from active participants
      .mockResolvedValueOnce(4); // my swipe progress
    const res = await swipe({ sessionId: 's1', movieId: 'm1', direction: 'right' });
    expect(res.status).toBe(200);
    expect(res.body.isMatch).toBe(true);
    expect(prisma.sessionSwipe.count.mock.calls[0][0].where).toMatchObject({
      direction: 'right',
      participant: { leftAt: null },
    });
    expect(prisma.match.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not match while an active participant has not liked it', async () => {
    prisma.swipeSession.findUnique.mockResolvedValue(groupSession());
    prisma.sessionSwipe.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const res = await swipe({ sessionId: 's1', movieId: 'm1', direction: 'right' });
    expect(res.body.isMatch).toBe(false);
    expect(prisma.match.upsert).not.toHaveBeenCalled();
  });

  it('clears a stale match when someone passes', async () => {
    prisma.swipeSession.findUnique.mockResolvedValue(groupSession());
    const res = await swipe({ sessionId: 's1', movieId: 'm1', direction: 'left' });
    expect(res.status).toBe(200);
    expect(prisma.match.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 's1', movieId: 'm1' } });
  });

  it('records a solo like as a pick', async () => {
    prisma.swipeSession.findUnique.mockResolvedValue({ id: 's2', type: 'solo', status: 'swiping', userId: 'u1', participants: [] });
    const res = await swipe({ sessionId: 's2', movieId: 'm1', direction: 'right' });
    expect(res.status).toBe(200);
    expect(res.body.isMatch).toBe(true);
    expect(prisma.sessionMovie.update).toHaveBeenCalledWith({
      where: { sessionId_movieId: { sessionId: 's2', movieId: 'm1' } },
      data: { user1Swipe: 'right' },
    });
  });
});
