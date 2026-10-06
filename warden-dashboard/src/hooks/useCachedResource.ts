import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedGet, peekCache, refreshGet } from '@/services/api/cache';

/**
 * One hook for every API-backed view.
 *
 * - `peekCache` runs during the first render, so switching back to a tab paints
 *   its data immediately - no skeleton flash, no request.
 * - The mount effect revalidates through `cachedGet` (background refresh when
 *   the entry is still fresh, one shared request per key).
 * - `pollMs` keeps live screens (live calls, call history, kiosks) fresh while
 *   the tab is visible; polling pauses when the document is hidden.
 * - `refresh()` is what mutations call, so only the key that changed refetches.
 */
interface Options {
  /** Cache lifetime in ms; older entries are refetched on mount. */
  ttl?: number;
  /** Live refresh interval in ms; 0 disables polling. */
  pollMs?: number;
}

/** Entries older than this still paint (stale-while-revalidate). */
const SHOW_TTL = 5 * 60_000;

export function useCachedResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  { ttl = 30_000, pollMs = 0 }: Options = {}
) {
  const [data, setData] = useState<T | undefined>(() => (key ? peekCache<T>(key, SHOW_TTL) : undefined));
  const [isLoading, setIsLoading] = useState(() => !!key && peekCache<T>(key, SHOW_TTL) === undefined);
  const [error, setError] = useState<string | null>(null);

  const dataRef = useRef<T | undefined>(data);
  dataRef.current = data;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async (mode: 'cache' | 'fresh') => {
    if (!key) return;
    try {
      const result = mode === 'fresh'
        ? await refreshGet<T>(key, () => fetcherRef.current(), ttl)
        : await cachedGet<T>(key, () => fetcherRef.current(), ttl);
      setData(result);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      // Keep whatever is already on screen; only flag it when nothing loaded.
      setError(dataRef.current === undefined ? message : null);
    } finally {
      setIsLoading(false);
    }
  }, [key, ttl]);

  // Page/filter changes swap the key: show the cached answer for that key, or
  // keep the previous page on screen while the new one loads.
  useEffect(() => {
    if (!key) return;
    const cached = peekCache<T>(key, SHOW_TTL);
    if (cached !== undefined) setData(cached);
    setIsLoading(dataRef.current === undefined && cached === undefined);
    load('cache');
  }, [key, load]);

  useEffect(() => {
    if (!key || !pollMs) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load('fresh');
    }, pollMs);
    return () => clearInterval(id);
  }, [key, pollMs, load]);

  const refresh = useCallback(() => load('fresh'), [load]);

  return { data, isLoading, error, refresh };
}
