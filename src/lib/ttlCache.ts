/**
 * A tiny in-process memo with a time-to-live, for read-only routes whose answer only changes when
 * the poller writes (hourly) but which several pages ask for at once — Home and the page it links
 * to, every tab a user opens. Keys must carry everything the answer depends on (league, params);
 * per-user answers must not be cached here. A throwing `compute` caches nothing.
 */
export interface TtlCache<T> {
  get: (key: string, compute: () => T, nowMs?: number) => T;
  clear: () => void;
}

export function createTtlCache<T>(ttlMs: number, maxEntries = 16): TtlCache<T> {
  if (!(ttlMs > 0)) throw new Error(`ttlCache: ttlMs must be positive, got ${ttlMs}`);
  const entries = new Map<string, { at: number; value: T }>();
  return {
    get(key, compute, nowMs = Date.now()) {
      const hit = entries.get(key);
      if (hit && nowMs - hit.at < ttlMs) return hit.value;
      const value = compute();
      entries.delete(key);
      entries.set(key, { at: nowMs, value });
      // Map keeps insertion order: the first key is the oldest write
      if (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      return value;
    },
    clear() {
      entries.clear();
    },
  };
}
