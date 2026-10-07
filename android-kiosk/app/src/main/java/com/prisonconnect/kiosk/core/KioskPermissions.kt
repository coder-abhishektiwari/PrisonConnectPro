package com.prisonconnect.kiosk.core

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.prisonconnect.kiosk.hardware.KioskDeviceAdminReceiver

/**
 * Single source of truth for every runtime permission the kiosk needs.
 *
 * They are collected once during setup so that calls, recording and uploads
 * never trigger a system dialog mid-session.
 */
object KioskPermissions {

    /** Runtime permissions, in the order they appear on the setup screen. */
    val REQUIRED: List<String>
        get() {
            val permissions = mutableListOf(
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            return permissions
        }

    fun isGranted(context: Context, permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    fun missing(context: Context): List<String> =
        REQUIRED.filter { !isGranted(context, it) }

    fun isDeviceOwner(context: Context): Boolean = try {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        dpm.isDeviceOwnerApp(context.packageName)
    } catch (e: Throwable) {
        Logger.w("KioskPermissions: device-owner check failed: ${e.message}")
        false
    }

    /**
     * Device-owner path: pre-grant everything without a single system dialog
     * (DPC grant state overrides the normal user prompt). Returns true only
     * when every permission actually ended up granted.
     */
    fun grantViaDeviceOwner(context: Context): Boolean {
        if (!isDeviceOwner(context)) return false
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(context, KioskDeviceAdminReceiver::class.java)
        for (permission in REQUIRED) {
            if (isGranted(context, permission)) continue
            try {
                dpm.setPermissionGrantState(
                    admin,
                    context.packageName,
                    permission,
                    DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
                )
            } catch (e: Throwable) {
                Logger.w("KioskPermissions: device-owner grant failed for $permission: ${e.message}")
            }
        }
        val still = missing(context)
        Logger.i("KioskPermissions: device-owner grant finished, still missing=$still")
        return still.isEmpty()
    }
}
