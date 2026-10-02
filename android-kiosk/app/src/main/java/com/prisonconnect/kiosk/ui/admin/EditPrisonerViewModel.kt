package com.prisonconnect.kiosk.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.models.admin.EditPrisonerRequest
import com.prisonconnect.kiosk.models.admin.Prisoner
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AdminRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class EditPrisonerViewModel @Inject constructor(
    private val adminRepository: AdminRepository
) : ViewModel() {

    private val _prisoner = MutableStateFlow<NetworkResult<Prisoner>>(NetworkResult.Idle)
    val prisoner: StateFlow<NetworkResult<Prisoner>> = _prisoner.asStateFlow()

    private val _updateState = MutableStateFlow<NetworkResult<Prisoner>>(NetworkResult.Idle)
    val updateState: StateFlow<NetworkResult<Prisoner>> = _updateState.asStateFlow()

    private val _resetPinState = MutableStateFlow<NetworkResult<String>>(NetworkResult.Idle)
    val resetPinState: StateFlow<NetworkResult<String>> = _resetPinState.asStateFlow()

    fun loadPrisoner(prisonerId: String) {
        viewModelScope.launch {
            adminRepository.getPrisoner(prisonerId).collect { result ->
                _prisoner.value = result
            }
        }
    }

    fun updatePrisoner(prisonerId: String, request: EditPrisonerRequest) {
        _updateState.value = NetworkResult.Loading
        viewModelScope.launch {
            adminRepository.editPrisoner(prisonerId, request).collect { result ->
                _updateState.value = result
            }
        }
    }

    fun resetPin(prisonerId: String, pin: String) {
        _resetPinState.value = NetworkResult.Loading
        viewModelScope.launch {
            _resetPinState.value = adminRepository.resetPrisonerPin(prisonerId, pin)
        }
    }

    fun resetResetPinState() {
        _resetPinState.value = NetworkResult.Idle
    }

    fun resetUpdateState() {
        _updateState.value = NetworkResult.Idle
    }
}
