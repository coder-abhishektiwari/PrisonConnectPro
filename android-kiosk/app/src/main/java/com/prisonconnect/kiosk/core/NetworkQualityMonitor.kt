package com.prisonconnect.kiosk.core

import android.os.SystemClock
import com.prisonconnect.kiosk.config.AppConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL

/**
 * Transport-agnostic internet quality probe.
 *
 * Instead of reading Wi-Fi RSSI (meaningless on Ethernet, and the RSSI API
 * is gone from recent SDKs anyway), this measures the real thing every link
 * type shares: round-trip latency to the backend. WiFi, Ethernet, mobile
 * hotspot — all report honest strength through actual responsiveness.
 *
 *   level 4: < 120 ms   full bars, green
 *   level 3: < 250 ms   green
 *   level 2: < 500 ms   amber
 *   level 1: < 1200 ms  orange
 *   level 0: failed / timeout / slower — red
 *
 * One probe every 5 s. Started once from PrisonKioskApp; the header reads
 * [quality] from any screen.
 */
object NetworkQualityMonitor {

    data class Quality(
        val online: Boolean,
        /** 0–4 signal level. */
        val level: Int,
        /** Last successful round-trip in ms, null when offline. */
        val latencyMs: Long?
    ) {
        companion object {
            val UNKNOWN = Quality(online = true, level = 0, latencyMs = null)
        }
    }

    private val _quality = MutableStateFlow(Quality.UNKNOWN)
    val quality: StateFlow<Quality> = _quality.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var started = false
    private const val PROBE_INTERVAL_MS = 5_000L
    private const val PROBE_TIMEOUT_MS = 4_000

    /** Idempotent — safe to call from Application.onCreate. */
    @Synchronized
    fun start() {
        if (started) return
        started = true
        scope.launch {
            while (true) {
                _quality.value = probe()
                delay(PROBE_INTERVAL_MS)
            }
        }
    }

    private fun probe(): Quality {
        // One immediate retry: Render dynos cold-start after idle and the
        // first request can time out while the server wakes — a single blip
        // must not flash the header red on a perfectly healthy link.
        var attempt = doProbe()
        if (!attempt.ok) attempt = doProbe()
        val level = if (!attempt.ok) 0 else when {
            attempt.latencyMs < 120 -> 4
            attempt.latencyMs < 250 -> 3
            attempt.latencyMs < 500 -> 2
            attempt.latencyMs < 1200 -> 1
            else -> 0
        }
        return Quality(online = attempt.ok, level = level, latencyMs = if (attempt.ok) attempt.latencyMs else null)
    }

    private fun doProbe(): ProbeResult {
        val start = SystemClock.elapsedRealtime()
        val ok = try {
            val url = URL(AppConfig.baseUrl.trimEnd('/') + "/health")
            val conn = url.openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = PROBE_TIMEOUT_MS
                conn.readTimeout = PROBE_TIMEOUT_MS
                conn.requestMethod = "GET"
                conn.responseCode == 200
            } finally {
                conn.disconnect()
            }
        } catch (t: Throwable) {
            false
        }
        return ProbeResult(ok, SystemClock.elapsedRealtime() - start)
    }

    private data class ProbeResult(val ok: Boolean, val latencyMs: Long)
}
