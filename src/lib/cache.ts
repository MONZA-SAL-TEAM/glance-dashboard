/**
 * Tiny in-memory TTL cache for API routes. Serverless instances lose it on
 * cold start, which is fine — the point is to keep warm-instance traffic from
 * burning the GA4 Data API's per-property hourly token budget, not to be a
 * durable store. Concurrent misses share one in-flight promise so a burst of
 * tabs doesn't fan out into duplicate upstream calls.
 */
const store = new Map<string, { expires: number; value: Promise<unknown> }>();

export function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;

  const entry = { expires: now + ttlMs, value: undefined as unknown as Promise<unknown> };
  entry.value = fn().catch((error) => {
    // Never cache failures — but only evict our own entry, never a newer one
    // that replaced us while this call was still in flight.
    if (store.get(key) === entry) store.delete(key);
    throw error;
  });
  store.set(key, entry);

  // Opportunistic sweep so abandoned keys don't accumulate forever.
  if (store.size > 200) {
    for (const [k, v] of store) {
      if (v.expires <= now) store.delete(k);
    }
  }

  return entry.value as Promise<T>;
}
