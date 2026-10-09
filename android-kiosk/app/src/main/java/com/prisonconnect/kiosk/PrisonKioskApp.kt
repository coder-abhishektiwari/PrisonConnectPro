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
