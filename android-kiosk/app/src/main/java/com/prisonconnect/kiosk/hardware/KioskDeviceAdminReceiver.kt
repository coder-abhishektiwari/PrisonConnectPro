package com.prisonconnect.kiosk.hardware

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import com.prisonconnect.kiosk.core.Logger

/**
 * Receiver to handle device administrator events.
 * This class is required for the app to be set as a Device Owner.
 */
class KioskDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Logger.i("Device Admin Enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Logger.w("Device Admin Disabled")
    }

    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) {
        super.onLockTaskModeEntering(context, intent, pkg)
        Logger.i("Kiosk Mode (Lock Task) Entered")
    }

    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        super.onLockTaskModeExiting(context, intent)
        Logger.w("Kiosk Mode (Lock Task) Exited")
    }
}
