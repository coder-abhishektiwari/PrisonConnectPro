package com.prisonconnect.kiosk.ui.admin

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.BuildConfig
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.SessionManager
import com.prisonconnect.kiosk.models.admin.HardwareStatus
import com.prisonconnect.kiosk.models.admin.KioskDevice
import com.prisonconnect.kiosk.models.admin.KioskHardware
import com.prisonconnect.kiosk.models.admin.NetworkStatus
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AdminRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class DeviceInfoViewModel @Inject constructor(
    private val adminRepository: AdminRepository,
    private val deviceInfoProvider: com.prisonconnect.kiosk.hardware.DeviceInfoProvider,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _deviceInfo = MutableStateFlow<KioskDevice?>(null)
    val deviceInfo: StateFlow<KioskDevice?> = _deviceInfo.asStateFlow()

    private val _localDeviceInfo = MutableStateFlow<Map<String, String>>(emptyMap())
    val localDeviceInfo: StateFlow<Map<String, String>> = _localDeviceInfo.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun loadDeviceInfo(deviceId: String) {
        // Local hardware identity — instant and always available.
        _localDeviceInfo.value = mapOf(
            "Serial" to (deviceInfoProvider.getDeviceSerialNumber()
                ?: deviceInfoProvider.getRegistrationDeviceId()),
            "IP Address" to (deviceInfoProvider.getIpAddress() ?: "Unavailable"),
            "Fingerprint" to deviceInfoProvider.getDeviceFingerprint()
        )

        viewModelScope.launch {
            // The admin devices API rejects a kiosk token, so the screen is
            // built from what THIS device knows; the remote call only enriches
            // fields we cannot know locally (location, last seen, firmware…).
            val prisonId = (runCatching { sessionManager.getKioskInfo()?.prisonId }.getOrNull()
                ?.takeIf { it.isNotBlank() })
                ?: runCatching { sessionManager.getRegisteredPrisonId() }.getOrNull()
            val local = buildLocalDevice(prisonId)
            _deviceInfo.value = local

            adminRepository.getDevice(deviceId).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _deviceInfo.value = mergeRemote(local, result.data)
                        _isLoading.value = false
                    }
                    is NetworkResult.Failure -> {
                        // Local data is already on screen; remote was a bonus.
                        _error.value = result.error.message
                        _isLoading.value = false
                    }
                    else -> {}
                }
            }
        }
    }

    /** Everything the device can answer about itself, offline-first. */
    private fun buildLocalDevice(prisonId: String?): KioskDevice {
        val serial = deviceInfoProvider.getDeviceSerialNumber()
            ?: deviceInfoProvider.getRegistrationDeviceId()
        val ip = deviceInfoProvider.getIpAddress()
        val now = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
        return KioskDevice(
            kioskId = Constants.KIOSK_ID,
            deviceId = serial,
            serialNumber = serial,
            prisonId = prisonId,
            status = "online",
            location = null,
            ipAddress = ip,
            firmwareVersion = Build.DISPLAY ?: "Unknown",
            appVersion = BuildConfig.VERSION_NAME,
            androidVersion = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            model = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            deviceFingerprint = deviceInfoProvider.getDeviceFingerprint(),
            lastSeen = now,
            hardware = KioskHardware(
                model = Build.MODEL,
                manufacturer = Build.MANUFACTURER,
                serialNumber = serial,
                processor = deviceInfoProvider.getCpuDescription(),
                ram = deviceInfoProvider.getRamDescription(),
                storage = deviceInfoProvider.getStorageDescription(),
                screenSize = deviceInfoProvider.getScreenResolution()
            ),
            camera = HardwareStatus(
                status = if (deviceInfoProvider.hasCamera()) "Available" else "Not available"
            ),
            microphone = HardwareStatus(
                status = if (deviceInfoProvider.hasMicrophone()) "Available" else "Not available"
            ),
            network = NetworkStatus(
                status = if (ip != null) "Connected" else "Not connected"
            )
        )
    }

    /** Remote wins only where it actually knows more than the device does. */
    private fun mergeRemote(local: KioskDevice, remote: KioskDevice): KioskDevice =
        local.copy(
            location = remote.location ?: local.location,
            firmwareVersion = remote.firmwareVersion ?: local.firmwareVersion,
            lastSeen = remote.lastSeen ?: local.lastSeen,
            hardware = remote.hardware?.takeIf { !it.ram.isNullOrBlank() || !it.processor.isNullOrBlank() }
                ?: local.hardware,
            camera = remote.camera?.takeIf { !it.status.isNullOrBlank() } ?: local.camera,
            microphone = remote.microphone?.takeIf { !it.status.isNullOrBlank() } ?: local.microphone,
            network = remote.network?.takeIf { !it.status.isNullOrBlank() } ?: local.network
        )
}
