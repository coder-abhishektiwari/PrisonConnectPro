package com.prisonconnect.kiosk.core

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
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
 * Two layers of truth, in order:
 *
 *  1. LOCAL LINK (ConnectivityManager): is Wi-Fi/Ethernet/mobile data
 *     actually attached with INTERNET capability? When the link is down the
 *     header must flip to all-red INSTANTLY — no waiting out an HTTP
 *     timeout.
 *  2. BACKEND ROUND-TRIP: when the local link is up, measure real latency
 *     to the backend. A kiosk on a perfect Wi-Fi network whose backend is
 *     cold-starting (sleeping Render dyno) or briefly down must NOT show
 *     "no signal" — the NETWORK is fine, so the icon stays lit at a
 *     degraded level instead of flipping fully red.
 *
 *   level 4: < 120 ms   full bars, green
 *   level 3: < 250 ms   green
 *   level 2: < 500 ms   amber
 *   level 1: < 1200 ms  orange
 *   level 0: link down  all bars red (only ever paired with online=false)
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
            val UNKNOWN = Quality(online = false, level = 0, latencyMs = null)
        }
    }

    private val _quality = MutableStateFlow(Quality.UNKNOWN)
    val quality: StateFlow<Quality> = _quality.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var started = false
    private const val PROBE_INTERVAL_MS = 5_000L
    private const val PROBE_TIMEOUT_MS = 4_000

    @Volatile
    private var connectivityManager: ConnectivityManager? = null

    /**
     * Idempotent — safe to call from Application.onCreate. Passing the
     * application [context] enables the local-link (ConnectivityManager)
     * layer so the header reflects Wi-Fi on/off instantly and a sleeping
     * backend never masquerades as a dead network.
     */
    @Synchronized
    fun start(context: Context? = null) {
        if (started) return
        started = true
        connectivityManager = context?.let {
            it.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        }
        // First paint: the local link is synchronously known — don't wait
        // for an HTTP probe that a cold Render dyno would fail.
        _quality.value = if (isLocalLinkUp()) {
            Quality(online = true, level = 3, latencyMs = null)
        } else {
            Quality(online = false, level = 0, latencyMs = null)
        }
        scope.launch {
            while (true) {
                _quality.value = probe()
                delay(PROBE_INTERVAL_MS)
            }
        }
    }

    /**
     * Link-layer truth: an active network with INTERNET capability. Instant
     * (<1 ms) — this is what "Wi-Fi turned off" must trip immediately.
     */
    private fun isLocalLinkUp(): Boolean {
        val cm = connectivityManager ?: return true // no context → probe decides
        return try {
            val network = cm.activeNetwork ?: return false
            cm.getNetworkCapabilities(network)
                ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        } catch (t: Throwable) {
            false
        }
    }

    private fun probe(): Quality {
        // Local link down → the NETWORK is off. Report it now; skip the
        // HTTP attempt entirely (it would only burn a 4 s timeout).
        if (!isLocalLinkUp()) {
            return Quality(online = false, level = 0, latencyMs = null)
        }
        // One immediate retry: Render dynos cold-start after idle and the
        // first request can time out while the server wakes — a single blip
        // must not flash the header red on a perfectly healthy link.
        var attempt = doProbe()
        if (!attempt.ok) attempt = doProbe()
        val level = if (!attempt.ok) {
            // Local link is UP but the backend is unreachable (sleeping
            // dyno, server outage). The network itself is fine — report
            // online at a degraded level, NOT the all-red "no signal" state
            // (that inversion made healthy Wi-Fi look dead).
            1
        } else when {
            attempt.latencyMs < 120 -> 1
            attempt.latencyMs < 250 -> 2
            attempt.latencyMs < 500 -> 3
            attempt.latencyMs < 1200 -> 4
            else -> 0
        }
        return Quality(online = true, level = level, latencyMs = if (attempt.ok) attempt.latencyMs else null)
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
