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

/**
 * Handles genuine USB discovery for physical fingerprint scanners.
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

    private fun isPotentialScanner(device: UsbDevice): Boolean {
        // Many scanners use Class 255 (Vendor Specific) or specific VIDs.
        // For now, we report any vendor-specific device as a potential scanner
        // to show detection in the UI.
        return device.deviceClass == 255 || device.vendorId != 0
    }
}
