package com.prisonconnect.kiosk.hardware

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import com.prisonconnect.kiosk.core.Logger
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Provides the physical hardware identity of the kiosk device.
 * Enforces strict serial number usage.
 */
@Singleton
class DeviceInfoProvider @Inject constructor(
    @ApplicationContext private val context: Context
) {

    /**
     * Returns the physical hardware serial number.
     * Requires the app to be Device Owner on API 29+.
     */
    @SuppressLint("HardwareIds")
    fun getDeviceSerialNumber(): String? {
        val hardwareSerial = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Build.getSerial()
            } else {
                Build.SERIAL
            }
        } catch (securityException: SecurityException) {
            Logger.e("Hardware serial access restricted. App must be Device Owner. ${securityException.message}")
            null
        } catch (exception: Exception) {
            Logger.e("Unexpected error reading hardware serial: ${exception.message}")
            null
        }

        val filteredSerial = hardwareSerial
            ?.trim()
            ?.takeIf {
                it.isNotEmpty() && !it.equals("unknown", ignoreCase = true)
            }

        Logger.d("Strict Hardware Serial: $filteredSerial")
        return filteredSerial
    }

    /**
     * Gets the active network IPv4 address of the device.
     */
    fun getIpAddress(): String? {
        return try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            for (networkInterface in java.util.Collections.list(interfaces)) {
                if (networkInterface.isLoopback || !networkInterface.isUp) continue
                val addresses = networkInterface.inetAddresses
                for (address in java.util.Collections.list(addresses)) {
                    if (!address.isLoopbackAddress && address is java.net.Inet4Address) {
                        return address.hostAddress
                    }
                }
            }
            null
        } catch (e: Exception) {
            Logger.e("Error getting device IP address: ${e.message}")
            null
        }
    }

    /**
     * Returns a stable registration identity for the device: the strict hardware
     * serial when available, otherwise the same "KIOSK-DEV-*" fallback derived
     * during kiosk registration. This keeps every flow (registration, status
     * polling, splash verification) using one consistent device identity, even
     * when the app is not Device Owner and Build.getSerial() is restricted.
     */
    fun getRegistrationDeviceId(): String {
        val strict = getDeviceSerialNumber()
        if (!strict.isNullOrBlank()) return strict
        val fallback = try {
            "KIOSK-DEV-${Build.SERIAL?.take(8) ?: "UNKNOWN"}"
        } catch (e: Exception) {
            "KIOSK-DEV-UNKNOWN"
        }
        Logger.w("Registration Device ID fallback: $fallback (app not Device Owner)")
        return fallback
    }

    /**
     * Generates a stable device fingerprint using hardware parameters.
     */
    fun getDeviceFingerprint(): String {
        val serial = getDeviceSerialNumber() ?: "NO_SERIAL"
        val rawFingerprint = "${Build.MANUFACTURER}_${Build.MODEL}_${Build.BOARD}_${Build.HARDWARE}_$serial"
        return try {
            val md = java.security.MessageDigest.getInstance("SHA-256")
            val digest = md.digest(rawFingerprint.toByteArray(Charsets.UTF_8))
            digest.joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            rawFingerprint.replace(" ", "_")
        }
    }
}
