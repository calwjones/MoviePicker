import { Router, Response } from 'express';
import { prisma } from '../app';
import { emit } from '../services/emitter';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getInCinemaIds, attachInCinema } from '../services/cinemaStatus';

const router = Router();

interface FriendRow {
  id: string;
  username: string;
  avatar_url: string | null;
  friendship_id: string;
}

interface PendingRow {
  friendship_id: string;
  created_at: Date;
  other_id: string;
  other_username: string;
  other_avatar_url: string | null;
  direction: 'incoming' | 'outgoing';
}

interface InviteRow {
  id: string;
  session_id: string;
  from_user_id: string;
  created_at: Date;
  expires_at: Date;
  from_username: string;
  short_code: string | null;
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const rows = await prisma.$queryRaw<FriendRow[]>`
      SELECT u.id, u.username, u.avatar_url, f.id as friendship_id
      FROM friendships f
      JOIN users u ON (
        (f.requester_id = ${userId} AND u.id = f.addressee_id)
        OR
        (f.addressee_id = ${userId} AND u.id = f.requester_id)
      )
      WHERE f.status = 'accepted'
      ORDER BY u.username ASC
    `;
    res.json({
      friends: rows.map((r) => ({
        id: r.id,
        username: r.username,
        avatarUrl: r.avatar_url,
        friendshipId: r.friendship_id,
      })),
    });
  } catch (err) {
    console.error('[friends] list failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const rows = await prisma.$queryRaw<PendingRow[]>`
      SELECT
        f.id as friendship_id,
        f.created_at,
        CASE WHEN f.addressee_id = ${userId} THEN f.requester_id ELSE f.addressee_id END as other_id,
        u.username as other_username,
        u.avatar_url as other_avatar_url,
        CASE WHEN f.addressee_id = ${userId} THEN 'incoming' ELSE 'outgoing' END as direction
      FROM friendships f
      JOIN users u ON u.id = (
        CASE WHEN f.addressee_id = ${userId} THEN f.requester_id ELSE f.addressee_id END
      )
      WHERE f.status = 'pending' AND (f.requester_id = ${userId} OR f.addressee_id = ${userId})
      ORDER BY f.created_at DESC
    `;
    res.json({
      pending: rows.map((r) => ({
        friendshipId: r.friendship_id,
        direction: r.direction,
        other: {
          id: r.other_id,
          username: r.other_username,
          avatarUrl: r.other_avatar_url,
        },
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[friends] pending failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/request', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { username } = req.body as { username?: string };
    const query = (username ?? '').trim().toLowerCase();
    if (!query) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { username: query },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (target.id === userId) {
      res.status(400).json({ error: 'You cannot friend yourself' });
      return;
    }

    const existing = await prisma.$queryRaw<{ status: string }[]>`
      SELECT status FROM friendships
      WHERE (requester_id = ${userId} AND addressee_id = ${target.id})
         OR (requester_id = ${target.id} AND addressee_id = ${userId})
      LIMIT 1
    `;
    if (existing[0]) {
      if (existing[0].status === 'accepted') {
        res.status(409).json({ error: 'Already friends' });
      } else if (existing[0].status === 'pending') {
        res.status(409).json({ error: 'Request already pending' });
      } else if (existing[0].status === 'rejected') {
        res.status(409).json({ error: 'Your previous request was declined' });
      } else {
        res.status(409).json({ error: 'Request blocked' });
      }
      return;
    }

    const rows = await prisma.$queryRaw<{ id: string; status: string }[]>`
      INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
      VALUES (gen_random_uuid()::text, ${userId}, ${target.id}, 'pending', NOW(), NOW())
      RETURNING id, status
    `;

    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, avatarUrl: true },
    });

    emit(`user:${target.id}`, 'friend-request', {
      friendshipId: rows[0].id,
      from: { id: userId, username: requester?.username, avatarUrl: requester?.avatarUrl },
    });

    res.status(201).json({
      friendship: {
        id: rows[0].id,
        status: rows[0].status,
        target: { id: target.id, username: target.username, avatarUrl: target.avatarUrl },
      },
    });
  } catch (err) {
    console.error('[friends] request failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;
    const rows = await prisma.$queryRaw<{ id: string; status: string; requester_id: string }[]>`
      UPDATE friendships
      SET status = 'accepted', updated_at = NOW()
      WHERE id = ${id} AND addressee_id = ${userId} AND status = 'pending'
      RETURNING id, status, requester_id
    `;
    if (!rows[0]) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    emit(`user:${rows[0].requester_id}`, 'friend-request-accepted', {
      friendshipId: rows[0].id,
      acceptedById: userId,
    });
    res.json({ friendship: { id: rows[0].id, status: rows[0].status } });
  } catch (err) {
    console.error('[friends] accept failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;
    await prisma.$executeRaw`
      UPDATE friendships
      SET status = 'rejected', updated_at = NOW()
      WHERE id = ${id} AND addressee_id = ${userId} AND status = 'pending'
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('[friends] reject failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/library', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const friendId = req.params.id as string;
    const filter = req.query.filter as string | undefined;

    const rel = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM friendships
      WHERE status = 'accepted'
        AND (
          (requester_id = ${userId} AND addressee_id = ${friendId})
          OR
          (requester_id = ${friendId} AND addressee_id = ${userId})
        )
      LIMIT 1
    `;
    if (!rel[0]) {
      res.status(403).json({ error: 'Not friends' });
      return;
    }

    const where: Record<string, unknown> = { userId: friendId, source: { not: 'dismissed' } };
    if (filter === 'watchlist') where.onWatchlist = true;
    if (filter === 'watched') where.watched = true;

    const [userMovies, inCinemaSet, friend] = await Promise.all([
      prisma.userMovie.findMany({
        where,
        include: { movie: true },
        orderBy: { createdAt: 'desc' },
      }),
      getInCinemaIds(),
      prisma.user.findUnique({
        where: { id: friendId },
        select: { id: true, username: true, avatarUrl: true },
      }),
    ]);

    const movies = userMovies.map((um) => ({
      id: um.id,
      movieId: um.movieId,
      watched: um.watched,
      onWatchlist: um.onWatchlist,
      userRating: um.userRating,
      createdAt: um.createdAt,
      movie: attachInCinema(um.movie, inCinemaSet),
    }));

    res.json({ friend, movies });
  } catch (err) {
    console.error('[friends] library failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;
    await prisma.$executeRaw`
      DELETE FROM friendships
      WHERE id = ${id} AND (requester_id = ${userId} OR addressee_id = ${userId})
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('[friends] remove failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/invites', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const rows = await prisma.$queryRaw<InviteRow[]>`
      SELECT
        i.id, i.session_id, i.from_user_id, i.created_at, i.expires_at,
        u.username as from_username,
        s.short_code
      FROM session_invites i
      JOIN users u ON u.id = i.from_user_id
      JOIN swipe_sessions s ON s.id = i.session_id
      WHERE i.to_user_id = ${userId} AND i.status = 'pending' AND i.expires_at > NOW()
        AND s.status = 'waiting'
      ORDER BY i.created_at DESC
    `;
    res.json({
      invites: rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        shortCode: r.short_code,
        from: { id: r.from_user_id, username: r.from_username },
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })),
    });
  } catch (err) {
    console.error('[friends] invites failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/invites/:inviteId/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const inviteId = req.params.inviteId as string;
    const rows = await prisma.$queryRaw<{ session_id: string }[]>`
      UPDATE session_invites
      SET status = 'accepted'
      WHERE id = ${inviteId} AND to_user_id = ${userId} AND status = 'pending' AND expires_at > NOW()
      RETURNING session_id
    `;
    if (!rows[0]) {
      res.status(404).json({ error: 'Invite not found or expired' });
      return;
    }
    res.json({ sessionId: rows[0].session_id });
  } catch (err) {
    console.error('[friends] accept invite failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/invites/:inviteId/decline', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const inviteId = req.params.inviteId as string;
    await prisma.$executeRaw`
      UPDATE session_invites SET status = 'declined'
      WHERE id = ${inviteId} AND to_user_id = ${userId} AND status = 'pending'
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('[friends] decline invite failed', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
