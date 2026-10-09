package com.prisonconnect.kiosk

import android.app.Application
import android.os.Build
import androidx.work.Configuration
import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.hardware.DeviceInfoProvider
import com.prisonconnect.kiosk.models.auth.KioskHeartbeatRequest
import com.prisonconnect.kiosk.upload.RecordingUploadWorker
import com.prisonconnect.kiosk.upload.RecordingUploadWorkerFactory
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * PrisonConnect Inmate Kiosk Entry Application Class.
 */
@HiltAndroidApp
class PrisonKioskApp : Application(), Configuration.Provider {

    @Inject lateinit var trustApiService: TrustApiService
    @Inject lateinit var deviceInfoProvider: DeviceInfoProvider
    /** Injected so the connectivity callback registers at process start and
     *  survives navigation across every screen. */
    @Inject lateinit var networkMonitor: com.prisonconnect.kiosk.core.NetworkMonitor
    @Inject lateinit var authRepository: com.prisonconnect.kiosk.repository.AuthRepository

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Custom factory so recording-upload workers get their Hilt deps. */
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(RecordingUploadWorkerFactory(this))
            .build()

    // Device identity and OS facts never change while the process lives, so
    // they are resolved once instead of on every ping.
    private val deviceId by lazy { deviceInfoProvider.getRegistrationDeviceId() }
    private val deviceFingerprint by lazy { deviceInfoProvider.getDeviceFingerprint() }
    private val androidVersion by lazy { "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})" }

    override fun onCreate() {
        super.onCreate()

        // Latency-based internet quality probe for the header signal bars.
        // Transport-agnostic (WiFi/Ethernet/mobile) — one loop for the app.
        com.prisonconnect.kiosk.core.NetworkQualityMonitor.start()

        // Fetch this kiosk's registered identity (serial, prison id/name) from
        // the public /kiosks/verify by KIOSK_ID and persist it in SessionManager.
        // Runs on the APP scope, not a splash ViewModel's scope: the splash
        // screen pops in ~1 s and a viewModelScope coroutine gets cancelled
        // mid-flight, which is why this data never used to stick.
        appScope.launch {
            authRepository.hydrateKioskInfo().collect { result ->
                when (result) {
                    is com.prisonconnect.kiosk.network.NetworkResult.Success ->
                        Logger.i("Kiosk info hydrated: ${result.data.kioskId} / ${result.data.prisonId}")
                    is com.prisonconnect.kiosk.network.NetworkResult.Failure ->
                        Logger.w("Kiosk info hydration failed: ${result.error.message}")
                    else -> {}
                }
            }
        }

        // Any recording whose metadata never reached the server before the
        // last process died (crash, reboot, network outage) is queued for
        // register+encrypt again; encrypted files are skipped by construction.
        RecordingUploadWorker.scanPending(this)

        // Single background ping. This is what the dashboard reads to decide
        // Online/Offline and Last Seen — without it a kiosk that is sitting idle
        // would never report in. A kiosk roams between Wi-Fi networks, so a
        // failed ping retries in a few seconds instead of waiting out the whole
        // interval and looking offline for an extra half minute. The response
        // also carries any warden retrieval requests — the only channel that
        // can ask a kiosk to push a recording up (no kiosk socket; the session
        // token dies on every app restart, but this public ping always works).
        appScope.launch {
            var intervalMs = HEARTBEAT_INTERVAL_MS
            while (isActive) {
                delay(intervalMs)
                intervalMs = if (sendHeartbeat()) HEARTBEAT_INTERVAL_MS else HEARTBEAT_RETRY_MS
            }
        }
    }

    private suspend fun sendHeartbeat(): Boolean {
        return try {
            val response = trustApiService.heartbeat(
                KioskHeartbeatRequest(
                    deviceSerialNumber = deviceId,
                    deviceFingerprint = deviceFingerprint,
                    androidVersion = androidVersion,
                    appVersion = com.prisonconnect.kiosk.BuildConfig.VERSION_NAME
                )
            )
            response.data?.pendingRetrievals.orEmpty().forEach { pending ->
                Logger.i("Heartbeat: retrieve requested recordingId=${pending.recordingId}")
                RecordingUploadWorker.enqueueRetrieve(this, pending)
            }
            true
        } catch (t: Throwable) {
            Logger.w("Heartbeat failed: ${t.message}")
            false
        }
    }

    private companion object {
        const val HEARTBEAT_INTERVAL_MS = 30_000L
        const val HEARTBEAT_RETRY_MS = 5_000L
    }
}
