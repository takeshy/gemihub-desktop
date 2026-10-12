const writes = new Map<string, Promise<unknown>>();

/** Timeline edits and arriving sync snapshots share one local transaction lane. */
export function withTimelineFileLock<T>(name: string, work: () => Promise<T>): Promise<T> {
  const previous = writes.get(name) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(work);
  writes.set(name, queued);
  return queued.finally(() => { if (writes.get(name) === queued) writes.delete(name); });
}
