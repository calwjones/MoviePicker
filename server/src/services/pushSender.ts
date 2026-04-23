import { prisma } from '../app';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

export type NotificationCategory =
  | 'matches'
  | 'invites'
  | 'friends'
  | 'sessionStarted'
  | 'sessionComplete';

interface PushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

interface ExpoPushResponseTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushResponseTicket[];
  errors?: { code: string; message: string }[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function postBatch(messages: PushPayload[]): Promise<ExpoPushResponseTicket[]> {
  if (messages.length === 0) return [];
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      console.error('[push] Expo HTTP error', response.status, await response.text());
      return [];
    }
    const json = (await response.json()) as ExpoPushResponse;
    return json.data ?? [];
  } catch (err) {
    console.error('[push] batch send failed', err);
    return [];
  }
}

async function pruneInvalidToken(token: string): Promise<void> {
  try {
    await prisma.deviceToken.deleteMany({ where: { expoPushToken: token } });
  } catch (err) {
    console.error('[push] failed to prune token', err);
  }
}

interface SendArgs {
  userIds: string[];
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendPush({
  userIds,
  category,
  title,
  body,
  data,
}: SendArgs): Promise<void> {
  if (userIds.length === 0) return;
  const dedupedUserIds = Array.from(new Set(userIds));

  let users: { id: string; notificationPreferences: unknown }[] = [];
  try {
    users = await prisma.user.findMany({
      where: { id: { in: dedupedUserIds } },
      select: { id: true, notificationPreferences: true },
    });
  } catch (err) {
    console.error('[push] failed to load users', err);
    return;
  }

  const allowedUserIds = users
    .filter((u) => {
      const prefs = (u.notificationPreferences ?? {}) as Record<string, boolean | undefined>;
      return prefs[category] !== false;
    })
    .map((u) => u.id);

  if (allowedUserIds.length === 0) return;

  let tokens: { expoPushToken: string }[] = [];
  try {
    tokens = await prisma.deviceToken.findMany({
      where: { userId: { in: allowedUserIds } },
      select: { expoPushToken: true },
    });
  } catch (err) {
    console.error('[push] failed to load tokens', err);
    return;
  }

  if (tokens.length === 0) return;

  const messages: PushPayload[] = tokens.map((t) => ({
    to: t.expoPushToken,
    title,
    body,
    data: { category, ...(data ?? {}) },
    sound: 'default',
    channelId: 'default',
  }));

  const batches = chunk(messages, BATCH_SIZE);
  for (const batch of batches) {
    const tickets = await postBatch(batch);
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === 'error') {
        const errorCode = ticket.details?.error;
        if (errorCode === 'DeviceNotRegistered') {
          await pruneInvalidToken(batch[i].to);
        } else {
          console.warn('[push] ticket error', errorCode, ticket.message);
        }
      }
    }
  }
}
