package com.prisonconnect.kiosk.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
    private val adminRepository: AdminRepository
) : ViewModel() {

    private val _biometrics = MutableStateFlow<NetworkResult<List<BiometricRegistration>>>(NetworkResult.Idle)
    val biometrics: StateFlow<NetworkResult<List<BiometricRegistration>>> = _biometrics.asStateFlow()

    private val _registerState = MutableStateFlow<NetworkResult<BiometricRegistration>>(NetworkResult.Idle)
    val registerState: StateFlow<NetworkResult<BiometricRegistration>> = _registerState.asStateFlow()

    private val _deleteState = MutableStateFlow<NetworkResult<Unit>>(NetworkResult.Idle)
    val deleteState: StateFlow<NetworkResult<Unit>> = _deleteState.asStateFlow()

    fun loadBiometrics(prisonerId: String) {
        viewModelScope.launch {
            adminRepository.getPrisonerBiometrics(prisonerId).collect { result ->
                if (result is NetworkResult.Loading && _biometrics.value is NetworkResult.Success) return@collect
                _biometrics.value = result
            }
        }
    }

    fun registerFace(prisonerId: String, imageBase64: String) {
        _registerState.value = NetworkResult.Loading
        viewModelScope.launch {
            val result = adminRepository.registerBiometric(
                prisonerId,
                RegisterBiometricRequest(type = "face", image = imageBase64)
            )
            _registerState.value = result
            if (result is NetworkResult.Success) loadBiometrics(prisonerId)
        }
    }

    fun registerFingerprint(prisonerId: String, template: String) {
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

    fun deleteBiometric(biometricId: String, prisonerId: String) {
        _deleteState.value = NetworkResult.Loading
        viewModelScope.launch {
            adminRepository.deleteBiometric(biometricId).collect { result ->
                _deleteState.value = result
                if (result is NetworkResult.Success) loadBiometrics(prisonerId)
            }
        }
    }

    fun resetRegisterState() { _registerState.value = NetworkResult.Idle }
    fun resetDeleteState() { _deleteState.value = NetworkResult.Idle }
}
