import { swipeApi } from './api';

const STORAGE_KEY = 'moviepicker_swipe_queue';

export interface QueuedSwipe {
  sessionId: string;
  movieId: string;
  direction: 'left' | 'right';
  timestamp: number;
}

function read(): QueuedSwipe[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(queue: QueuedSwipe[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {}
}

export function enqueueSwipe(entry: Omit<QueuedSwipe, 'timestamp'>): void {
  const queue = read();
  queue.push({ ...entry, timestamp: Date.now() });
  write(queue);
}

export function getQueueSize(): number {
  return read().length;
}

export function hasQueuedSwipes(): boolean {
  return read().length > 0;
}

let flushing = false;

export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  if (flushing) return { flushed: 0, failed: 0 };
  flushing = true;
  let flushed = 0;
  let failed = 0;
  try {
    let queue = read();
    while (queue.length > 0) {
      const next = queue[0];
      try {
        await swipeApi.swipe(next.sessionId, next.movieId, next.direction);
        flushed++;
        queue = queue.slice(1);
        write(queue);
      } catch {
        failed++;
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { flushed, failed };
}

export function clearQueueForSession(sessionId: string): void {
  const queue = read().filter((e) => e.sessionId !== sessionId);
  write(queue);
}
