package com.prisonconnect.kiosk.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.hardware.FingerprintHardwareManager
import com.prisonconnect.kiosk.hardware.RfidReaderManager
import com.prisonconnect.kiosk.models.admin.BiometricRegistration
import com.prisonconnect.kiosk.models.admin.RegisterBiometricRequest
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AdminRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class BiometricRegistrationViewModel @Inject constructor(
    private val adminRepository: AdminRepository,
    private val rfidReaderManager: RfidReaderManager,
    private val fingerprintHardwareManager: FingerprintHardwareManager
) : ViewModel() {

    private val _biometrics = MutableStateFlow<NetworkResult<List<BiometricRegistration>>>(NetworkResult.Idle)
    val biometrics: StateFlow<NetworkResult<List<BiometricRegistration>>> = _biometrics.asStateFlow()

    private val _registerState = MutableStateFlow<NetworkResult<BiometricRegistration>>(NetworkResult.Idle)
    val registerState: StateFlow<NetworkResult<BiometricRegistration>> = _registerState.asStateFlow()

    private val _deleteState = MutableStateFlow<NetworkResult<Unit>>(NetworkResult.Idle)
    val deleteState: StateFlow<NetworkResult<Unit>> = _deleteState.asStateFlow()

    /** Live hardware sessions consumed by the capture dialogs. */
    val rfidState = rfidReaderManager.state
    val fingerprintState = fingerprintHardwareManager.captureState

    /**
     * Open a hardware capture session for the given biometric type
     * ("fingerprint" | "rfid") while its registration dialog is open.
     */
    fun startCapture(type: String) {
        if (type == "rfid") rfidReaderManager.startSession() else fingerprintHardwareManager.startCapture()
    }

    /** Close both capture sessions (dialog dismissed, screen left). */
    fun stopCapture() {
        rfidReaderManager.stopSession()
        fingerprintHardwareManager.stopCapture()
    }

    /** Consume a hardware read so the session keeps emitting for the next one. */
    fun acknowledgeCapture(type: String) {
        if (type == "rfid") rfidReaderManager.acknowledgeRead() else fingerprintHardwareManager.acknowledgeCapture()
    }

    fun loadBiometrics(prisonerId: String) {
        viewModelScope.launch {
            adminRepository.getPrisonerBiometrics(prisonerId).collect { result ->
                if (result is NetworkResult.Loading && _biometrics.value is NetworkResult.Success) return@collect
                _biometrics.value = result
            }
        }
    }

    fun registerFingerprint(prisonerId: String, template: String) {
        if (_registerState.value is NetworkResult.Loading) return
        _registerState.value = NetworkResult.Loading
        viewModelScope.launch {
            val result = adminRepository.registerBiometric(
                prisonerId,
                RegisterBiometricRequest(type = "fingerprint", capture = template)
            )
            _registerState.value = result
            if (result is NetworkResult.Success) loadBiometrics(prisonerId)
        }
    }

    fun registerRfid(prisonerId: String, token: String) {
        if (_registerState.value is NetworkResult.Loading) return
        _registerState.value = NetworkResult.Loading
        viewModelScope.launch {
            val result = adminRepository.registerBiometric(
                prisonerId,
                RegisterBiometricRequest(type = "rfid", rfidToken = token)
            )
            _registerState.value = result
            if (result is NetworkResult.Success) loadBiometrics(prisonerId)
        }
    }

    /**
     * The HID wedge reader typed a card number + Enter into the hidden text
     * field of the RFID dialog. Route it through the hardware manager so the
     * screen's CardRead handler (detect → auto-register) does the rest.
     */
    fun onRfidCardTapped(token: String) {
        if (_registerState.value is NetworkResult.Loading) return
        rfidReaderManager.onCardRead(token)
    }

    fun deleteBiometric(biometricId: String, prisonerId: String) {
        _deleteState.value = NetworkResult.Loading
        viewModelScope.launch {
            adminRepository.deleteBiometric(biometricId, prisonerId).collect { result ->
                _deleteState.value = result
                if (result is NetworkResult.Success) loadBiometrics(prisonerId)
            }
        }
    }

    fun resetRegisterState() { _registerState.value = NetworkResult.Idle }
    fun resetDeleteState() { _deleteState.value = NetworkResult.Idle }
}
