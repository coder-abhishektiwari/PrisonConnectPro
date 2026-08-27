package com.prisonconnect.kiosk.core

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Simple in-memory API response cache with TTL.
 * Avoids re-fetching data on every screen navigation.
 */
@Singleton
class ApiCache @Inject constructor() {

    private data class CacheEntry(
        val data: Any?,
        val timestamp: Long
    )

    private val cache = ConcurrentHashMap<String, CacheEntry>()

    /**
     * Get cached data if fresh enough.
     * @param key Cache key (usually the endpoint URL)
     * @param ttlMs Max age in milliseconds (default 30 seconds)
     */
    @Suppress("UNCHECKED_CAST")
    fun <T> get(key: String, ttlMs: Long = DEFAULT_TTL): T? {
        val entry = cache[key] ?: return null
        if (System.currentTimeMillis() - entry.timestamp > ttlMs) {
            cache.remove(key)
            return null
        }
        return entry.data as? T
    }

    /**
     * Store data in cache.
     */
    fun put(key: String, data: Any?) {
        cache[key] = CacheEntry(data, System.currentTimeMillis())
    }

    /**
     * Get from cache or fetch fresh data.
     */
    suspend fun <T> getOrFetch(
        key: String,
        ttlMs: Long = DEFAULT_TTL,
        fetcher: suspend () -> T
    ): T {
        val cached = get<T>(key, ttlMs)
        if (cached != null) return cached
        val data = fetcher()
        put(key, data)
        return data
    }

    /**
     * Invalidate specific cache entries.
     */
    fun invalidate(vararg keys: String) {
        keys.forEach { cache.remove(it) }
    }

    /**
     * Invalidate all entries matching a prefix.
     */
    fun invalidatePrefix(prefix: String) {
        val keys = cache.keys.filter { it.startsWith(prefix) }
        keys.forEach { cache.remove(it) }
    }

    /**
     * Clear entire cache (call on logout).
     */
    fun clear() {
        cache.clear()
    }

    companion object {
        const val DEFAULT_TTL = 30_000L // 30 seconds
    }
}
