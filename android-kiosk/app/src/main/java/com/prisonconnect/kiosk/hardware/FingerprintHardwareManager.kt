package com.prisonconnect.kiosk.hardware

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import com.prisonconnect.kiosk.core.Logger
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

private const val ACTION_USB_PERMISSION = "com.prisonconnect.kiosk.USB_PERMISSION"

/** Live state of one fingerprint-capture session. */
sealed class FingerprintCaptureState {
    /** No capture session running. */
    data object Idle : FingerprintCaptureState()

    /** Session active, waiting for a finger on the scanner. */
    data object Searching : FingerprintCaptureState()

    /** A finger was captured — session code must consume it (acknowledgeCapture). */
    data class Captured(val template: String) : FingerprintCaptureState()

    /** The scanner reported a fault — UI falls back to manual entry. */
    data class Failed(val message: String) : FingerprintCaptureState()
}

/**
 * Handles genuine USB discovery for physical fingerprint scanners.
 *
 * >>> HARDWARE SWAP: when the external scanner model is final, change ONLY
 * this file. Implement [startCaptureDriver]/[stopCaptureDriver] at the bottom
 * (VID/PID + vendor capture protocol) and push results with
 * [onTemplateCaptured]/[onCaptureError]. Login (LoginViewModel) and
 * registration (BiometricRegistrationViewModel) already consume [captureState].
 */
@Singleton
class FingerprintHardwareManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager

    private val _connectedScanner = MutableStateFlow<UsbDevice?>(null)
    val connectedScanner = _connectedScanner.asStateFlow()

    private val _hasPermission = MutableStateFlow(false)
    val hasPermission = _hasPermission.asStateFlow()

    private val _captureState = MutableStateFlow<FingerprintCaptureState>(FingerprintCaptureState.Idle)
    val captureState = _captureState.asStateFlow()

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (ACTION_USB_PERMISSION == intent.action) {
                synchronized(this) {
                    val device: UsbDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    }
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        device?.apply {
                            Logger.i("USB Permission GRANTED for $deviceName")
                            _hasPermission.value = true
                        }
                    } else {
                        Logger.w("USB Permission DENIED for device")
                        _hasPermission.value = false
                    }
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED == intent.action) {
                scanForDevices()
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED == intent.action) {
                scanForDevices()
            }
        }
    }

    init {
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(usbReceiver, filter)
        }

        scanForDevices()
    }

    /**
     * Performs a genuine scan of all physical USB devices.
     */
    fun scanForDevices() {
        val deviceList = usbManager.deviceList
        Logger.d("FingerprintHardwareManager: Scanning ${deviceList.size} USB devices.")

        // We look for devices that might be fingerprint scanners.
        // Once we have a specific vendor, we will add their VID/PID here.
        val potentialScanner = deviceList.values.firstOrNull { device ->
            isPotentialScanner(device)
        }

        _connectedScanner.value = potentialScanner
        if (potentialScanner != null) {
            Logger.i("Detected potential scanner: VID=${potentialScanner.vendorId} PID=${potentialScanner.productId}")
            _hasPermission.value = usbManager.hasPermission(potentialScanner)
        } else {
            _hasPermission.value = false
        }
    }

    /**
     * Requests system permission to access the USB device.
     */
    fun requestPermission(device: UsbDevice) {
        if (usbManager.hasPermission(device)) {
            _hasPermission.value = true
            return
        }
        val permissionIntent = PendingIntent.getBroadcast(
            context,
            0,
            Intent(ACTION_USB_PERMISSION),
            PendingIntent.FLAG_IMMUTABLE
        )
        usbManager.requestPermission(device, permissionIntent)
    }

    /**
     * Begin (or resume) a capture session: re-scan for the USB scanner and
     * start listening for a finger. Safe to call repeatedly.
     */
    fun startCapture() {
        if (_captureState.value is FingerprintCaptureState.Searching) return
        _captureState.value = FingerprintCaptureState.Searching
        Logger.i("FingerprintHardwareManager: capture session started")
        scanForDevices()
        startCaptureDriver()
    }

    /** End the capture session (screen closed, auth finished, user backed out). */
    fun stopCapture() {
        stopCaptureDriver()
        _captureState.value = FingerprintCaptureState.Idle
    }

    /**
     * Re-arm the session after a capture was consumed. Keeps [captureState]
     * emitting so the next finger produces a fresh Captured event.
     */
    fun acknowledgeCapture() {
        if (_captureState.value is FingerprintCaptureState.Captured) {
            _captureState.value = FingerprintCaptureState.Searching
        }
    }

    /** Call from the driver whenever a finger template/ID is captured. */
    fun onTemplateCaptured(template: String) {
        val cleaned = template.trim()
        if (cleaned.isEmpty()) return
        Logger.i("FingerprintHardwareManager: template captured")
        _captureState.value = FingerprintCaptureState.Captured(cleaned)
    }

    /** Call from the driver on a capture fault — UI shows manual entry. */
    fun onCaptureError(message: String) {
        Logger.w("FingerprintHardwareManager: capture error: $message")
        _captureState.value = FingerprintCaptureState.Failed(message)
    }

    private fun isPotentialScanner(device: UsbDevice): Boolean {
        // Many scanners use Class 255 (Vendor Specific) or specific VIDs.
        // For now, we report any vendor-specific device as a potential scanner
        // to show detection in the UI.
        return device.deviceClass == 255 || device.vendorId != 0
    }

    // ================================================================
    // HARDWARE DRIVER HOOK — the ONLY place to change when the external
    // scanner model is final. Until then the session stays in Searching
    // and the UI offers manual fingerprint-ID entry.
    // ================================================================

    private fun startCaptureDriver() {
        // TODO(hardware): match the scanner by VID/PID (see connectedScanner),
        // open it with UsbManager / the vendor SDK and stream captures:
        //   onTemplateCaptured(template)  on each finger
        //   onCaptureError(message)       on faults
    }

    private fun stopCaptureDriver() {
        // TODO(hardware): close the scanner connection here.
    }
}
