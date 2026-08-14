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

    fun loadPrisoner(prisonerId: String) {
        viewModelScope.launch {
            adminRepository.getPrisoner(prisonerId).collect { result ->
                _prisoner.value = result
            }
        }
    }

    fun updatePrisoner(
        prisonerId: String,
        fullName: String,
        mobileNumber: String,
        cellBlock: String,
        securityLevel: String,
        sentenceDetails: String,
        status: String,
        active: Boolean
    ) {
        _updateState.value = NetworkResult.Loading
        val request = EditPrisonerRequest(
            fullName = fullName.ifBlank { null },
            mobileNumber = mobileNumber.ifBlank { null },
            cellBlock = cellBlock.ifBlank { null },
            securityLevel = securityLevel.ifBlank { null },
            sentenceDetails = sentenceDetails.ifBlank { null },
            status = status,
            active = active
        )

        viewModelScope.launch {
            adminRepository.editPrisoner(prisonerId, request).collect { result ->
                _updateState.value = result
            }
        }
    }

    fun resetUpdateState() {
        _updateState.value = NetworkResult.Idle
    }
}
