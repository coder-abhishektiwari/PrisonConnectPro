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

    /** Identity this kiosk registered/saved with — matches what the warden sees. */
    private val _registeredSerial = MutableStateFlow<String?>(null)
    val registeredSerial: StateFlow<String?> = _registeredSerial.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun loadDeviceInfo(deviceId: String) {
        viewModelScope.launch {
            val kioskInfo = runCatching { sessionManager.getKioskInfo() }.getOrNull()
            val registeredSerial = kioskInfo?.deviceSerialNumber?.takeIf { it.isNotBlank() }
            _registeredSerial.value = registeredSerial

            // Local hardware identity — instant and always available. The
            // Serial shown here is the one stored at registration/verify (the
            // same value the warden dashboard lists), not a fresh hardware
            // read that would fall back to a placeholder id.
            _localDeviceInfo.value = mapOf(
                "Serial" to (registeredSerial
                    ?: deviceInfoProvider.getRegistrationDeviceId()),
                "IP Address" to (deviceInfoProvider.getIpAddress() ?: "Unavailable")
            )

            val prisonId = kioskInfo?.prisonId?.takeIf { it.isNotBlank() }
                ?: runCatching { sessionManager.getRegisteredPrisonId() }.getOrNull()
            val local = buildLocalDevice(prisonId, kioskInfo?.prisonName, registeredSerial)
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
    private fun buildLocalDevice(
        prisonId: String?,
        prisonName: String?,
        serialOverride: String?
    ): KioskDevice {
        val serial = serialOverride
            ?: deviceInfoProvider.getDeviceSerialNumber()
            ?: deviceInfoProvider.getRegistrationDeviceId()
        val ip = deviceInfoProvider.getIpAddress()
        return KioskDevice(
            kioskId = Constants.KIOSK_ID,
            deviceId = serial,
            serialNumber = serial,
            prisonId = prisonId,
            prisonName = prisonName,
            status = "online",
            location = null,
            ipAddress = ip,
            appVersion = BuildConfig.VERSION_NAME,
            androidVersion = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            model = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            deviceFingerprint = deviceInfoProvider.getDeviceFingerprint(),
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
            hardware = remote.hardware?.takeIf { !it.ram.isNullOrBlank() || !it.processor.isNullOrBlank() }
                ?: local.hardware,
            camera = remote.camera?.takeIf { !it.status.isNullOrBlank() } ?: local.camera,
            microphone = remote.microphone?.takeIf { !it.status.isNullOrBlank() } ?: local.microphone,
            network = remote.network?.takeIf { !it.status.isNullOrBlank() } ?: local.network
        )
}
