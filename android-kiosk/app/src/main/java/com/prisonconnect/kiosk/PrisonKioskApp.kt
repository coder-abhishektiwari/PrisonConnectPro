package com.prisonconnect.kiosk

import android.app.Application
import android.os.Build
import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.hardware.DeviceInfoProvider
import com.prisonconnect.kiosk.models.auth.KioskHeartbeatRequest
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
class PrisonKioskApp : Application() {

    @Inject lateinit var trustApiService: TrustApiService
    @Inject lateinit var deviceInfoProvider: DeviceInfoProvider

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // Device identity and OS facts never change while the process lives, so
    // they are resolved once instead of on every ping.
    private val deviceId by lazy { deviceInfoProvider.getRegistrationDeviceId() }
    private val deviceFingerprint by lazy { deviceInfoProvider.getDeviceFingerprint() }
    private val androidVersion by lazy { "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})" }

    override fun onCreate() {
        super.onCreate()

        // Single background ping every 30s. This is what the dashboard reads to
        // decide Online/Offline and Last Seen — without it a kiosk that is
        // sitting idle would never report in.
        appScope.launch {
            while (isActive) {
                delay(HEARTBEAT_INTERVAL_MS)
                sendHeartbeat()
            }
        }
    }

    private suspend fun sendHeartbeat() {
        try {
            trustApiService.heartbeat(
                KioskHeartbeatRequest(
                    deviceSerialNumber = deviceId,
                    deviceFingerprint = deviceFingerprint,
                    androidVersion = androidVersion,
                    appVersion = com.prisonconnect.kiosk.BuildConfig.VERSION_NAME
                )
            )
        } catch (t: Throwable) {
            Logger.w("Heartbeat failed: ${t.message}")
        }
    }

    private companion object {
        const val HEARTBEAT_INTERVAL_MS = 30_000L
    }
}
