/**
 * Simple API response cache with stale-while-revalidate strategy.
 *
 * - In-memory cache for instant access within a session
 * - localStorage backup so data persists across page refreshes
 * - Configurable TTL (time-to-live) per endpoint
 * - Background revalidation: show cached data → fetch fresh → update
 */

const memoryCache = new Map<string, { data: unknown; timestamp: number }>();
const inflight = new Map<string, Promise<unknown>>();

const CACHE_PREFIX = 'pc_cache_';
const DEFAULT_TTL = 30_000; // 30 seconds

function storageKey(key: string): string {
  return CACHE_PREFIX + key;
}

function readStorage(key: string): { data: unknown; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStorage(key: string, data: unknown): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // Storage full or unavailable — silent fail
  }
}

function isStale(entry: { timestamp: number }, ttl: number): boolean {
  return Date.now() - entry.timestamp > ttl;
}

/**
 * Fetch with cache. Returns cached data immediately if available,
 * then fetches fresh data in background and updates.
 *
 * @param key      Cache key (usually the API endpoint URL)
 * @param fetcher  Async function that returns fresh data
 * @param ttl      Cache lifetime in ms (default 30s)
 * @returns        Cached or fresh data
 */
export async function cachedGet<T>(key: string, fetcher: () => Promise<T>, ttl = DEFAULT_TTL): Promise<T> {
  // 1. Check in-memory cache
  const mem = memoryCache.get(key);
  if (mem && !isStale(mem, ttl)) {
    // Fresh in memory — return immediately, optionally revalidate in background
    revalidateInBackground(key, fetcher, ttl);
    return mem.data as T;
  }

  // 2. Check localStorage (survives page refresh)
  const stored = readStorage(key);
  if (stored && !isStale(stored, ttl)) {
    // Stale-while-revalidate: return cached, fetch fresh in background
    memoryCache.set(key, stored);
    revalidateInBackground(key, fetcher, ttl);
    return stored.data as T;
  }

  // 3. No cache or expired — fetch fresh (deduplicate concurrent requests)
  return fetchFresh(key, fetcher, ttl);
}

async function fetchFresh<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
  // Deduplicate concurrent calls to the same endpoint
  if (inflight.has(key)) {
    return inflight.get(key) as Promise<T>;
  }

  const promise = fetcher()
    .then((data) => {
      const entry = { data, timestamp: Date.now() };
      memoryCache.set(key, entry);
      writeStorage(key, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

function revalidateInBackground<T>(key: string, fetcher: () => Promise<T>, ttl: number): void {
  // Only revalidate if data is getting stale (> 75% of TTL elapsed)
  const mem = memoryCache.get(key);
  if (!mem || Date.now() - mem.timestamp < ttl * 0.75) return;

  fetchFresh(key, fetcher, ttl).catch(() => {
    // Background revalidation failed — keep showing stale data
  });
}

/**
 * Invalidate specific cache entries (call after mutations).
 */
export function invalidateCache(...keys: string[]): void {
  for (const key of keys) {
    memoryCache.delete(key);
    try { localStorage.removeItem(storageKey(key)); } catch { /* noop */ }
  }
}

/**
 * Clear all cached data (call on logout).
 */
export function clearCache(): void {
  memoryCache.clear();
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }
}
