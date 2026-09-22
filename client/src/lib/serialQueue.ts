/**
 * Runs async tasks strictly one after another, in call order, regardless of
 * whether earlier ones failed. Lets the UI advance optimistically while the
 * server still sees swipe → swipe → undo → done in the order they happened.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
}

export type SerialRunner = ReturnType<typeof createSerialQueue>;

/** 4xx (other than timeout / rate limit) means retrying will never succeed. */
export function isPermanentFailure(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
}
