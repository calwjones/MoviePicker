import { swipeApi } from './api';
import { isPermanentFailure } from './serialQueue';

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
      } catch (err) {
        if (isPermanentFailure(err)) {
          // The server will never accept this one (session ended, movie gone):
          // drop it so it can't block every swipe queued behind it.
          failed++;
          queue = queue.slice(1);
          write(queue);
          continue;
        }
        failed++;
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { flushed, failed };
}

/** Remove a not-yet-synced swipe. Returns true if one was queued (so the server never saw it). */
export function dequeueSwipe(sessionId: string, movieId: string): boolean {
  const queue = read();
  const idx = queue.map((e) => e.sessionId === sessionId && e.movieId === movieId).lastIndexOf(true);
  if (idx === -1) return false;
  queue.splice(idx, 1);
  write(queue);
  return true;
}

export function clearQueueForSession(sessionId: string): void {
  const queue = read().filter((e) => e.sessionId !== sessionId);
  write(queue);
}
