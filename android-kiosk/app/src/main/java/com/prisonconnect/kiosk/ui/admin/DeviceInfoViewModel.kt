package com.prisonconnect.kiosk.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.models.admin.KioskDevice
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
    private val deviceInfoProvider: com.prisonconnect.kiosk.hardware.DeviceInfoProvider
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
        // Load local hardware info
        _localDeviceInfo.value = mapOf(
            "Serial" to (deviceInfoProvider.getDeviceSerialNumber() ?: "Can't be fetched"),
            "IP Address" to (deviceInfoProvider.getIpAddress() ?: "Can't be fetched"),
            "Fingerprint" to deviceInfoProvider.getDeviceFingerprint()
        )

        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            adminRepository.getDevice(deviceId).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _deviceInfo.value = result.data
                        _isLoading.value = false
                    }
                    is NetworkResult.Failure -> {
                        _error.value = result.error.message
                        _isLoading.value = false
                    }
                    else -> {}
                }
            }
        }
    }
}
