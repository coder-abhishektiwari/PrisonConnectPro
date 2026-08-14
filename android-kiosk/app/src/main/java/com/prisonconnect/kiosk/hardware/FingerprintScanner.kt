package com.prisonconnect.kiosk.hardware

import kotlinx.coroutines.flow.StateFlow

/**
 * Common interface for physical fingerprint scanner hardware.
 * Vendor-specific SDKs (Mantra, Morpho, etc.) must implement this.
 */
interface FingerprintScanner {

    /**
     * The hardware Vendor ID (VID).
     */
    val vendorId: Int

    /**
     * The hardware Product ID (PID).
     */
    val productId: Int

    /**
     * Current status of the physical hardware.
     */
    val status: StateFlow<ScannerStatus>

    /**
     * Initializes the vendor SDK and connects to the sensor.
     */
    suspend fun initialize(): Result<Unit>

    /**
     * Triggers a physical capture on the sensor.
     * Returns the raw capture data for server-side verification.
     */
    suspend fun capture(): Result<ByteArray>

    /**
     * Releases hardware resources and disconnects the SDK.
     */
    fun release()
}

sealed class ScannerStatus {
    data object Disconnected : ScannerStatus()
    data object Initializing : ScannerStatus()
    data object Ready : ScannerStatus()
    data object Capturing : ScannerStatus()
    data class Error(val message: String) : ScannerStatus()
}
