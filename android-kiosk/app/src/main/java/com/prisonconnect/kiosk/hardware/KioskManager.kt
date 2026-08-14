package com.prisonconnect.kiosk.hardware

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import com.prisonconnect.kiosk.core.Logger
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages Kiosk Mode (COSU) features.
 */
@Singleton
class KioskManager @Inject constructor() {

    /**
     * Enters Lock Task Mode (Kiosk Mode).
     * Requirements: App must be a Device Owner or on the whitelist.
     */
    fun enterKioskMode(activity: Activity) {
        val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminName = ComponentName(activity, KioskDeviceAdminReceiver::class.java)

        if (dpm.isDeviceOwnerApp(activity.packageName)) {
            Logger.i("KioskManager: App is Device Owner. Setting Lock Task Packages.")
            dpm.setLockTaskPackages(adminName, arrayOf(activity.packageName))

            // Uncomment the following line to enable full Kiosk mode on a managed device.
            // activity.startLockTask()

            Logger.i("KioskManager: Kiosk mode initialized (startLockTask is currently commented for testing).")
        } else {
            Logger.w("KioskManager: App is NOT Device Owner. Full Kiosk mode unavailable.")
        }
    }

    /**
     * Exits Lock Task Mode.
     */
    fun exitKioskMode(activity: Activity) {
        try {
            activity.stopLockTask()
            Logger.i("KioskManager: Kiosk mode exited.")
        } catch (e: Exception) {
            Logger.e("KioskManager: Error exiting kiosk mode: ${e.message}")
        }
    }
}
