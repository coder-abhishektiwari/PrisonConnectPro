package com.prisonconnect.kiosk.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.models.admin.CreatePrisonerRequest
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AdminRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AddPrisonerViewModel @Inject constructor(
    private val adminRepository: AdminRepository
) : ViewModel() {

    private val _registrationState = MutableStateFlow<RegistrationState>(RegistrationState.Idle)
    val registrationState: StateFlow<RegistrationState> = _registrationState.asStateFlow()

    fun registerPrisoner(
        firstName: String,
        lastName: String,
        mobileNumber: String,
        dateOfBirth: String,
        gender: String,
        prisonerNumber: String,
        cellBlock: String,
        cellNumber: String,
        securityLevel: String,
        sentenceStart: String,
        sentenceEnd: String,
        sentenceDetails: String,
        pin: String,
        faceTemplate: String? = null,
        fingerprintTemplate: String? = null,
        rfidTag: String? = null
    ) {
        val fullName = "${firstName.trim()} ${lastName.trim()}".trim()
        if (fullName.isEmpty()) {
            _registrationState.value = RegistrationState.Error("Prisoner name is required")
            return
        }

        _registrationState.value = RegistrationState.Loading

        val request = CreatePrisonerRequest(
            prisonerNumber = prisonerNumber.ifBlank { "PN-${System.currentTimeMillis()}" },
            fullName = fullName,
            mobileNumber = mobileNumber.ifBlank { null },
            dateOfBirth = dateOfBirth.ifBlank { null },
            gender = gender.ifBlank { null },
            cellBlock = cellBlock.ifBlank { null },
            securityLevel = securityLevel.ifBlank { null },
            sentenceDetails = sentenceDetails.ifBlank { null },
            faceTemplate = faceTemplate?.ifBlank { null },
            fingerprintTemplate = fingerprintTemplate?.ifBlank { null },
            rfidTag = rfidTag?.ifBlank { null }
        )

        viewModelScope.launch {
            adminRepository.createPrisoner(request).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _registrationState.value = RegistrationState.Success(
                            prisonerId = result.data.inmateId,
                            message = "Prisoner registered successfully"
                        )
                    }
                    is NetworkResult.Failure -> {
                        _registrationState.value = RegistrationState.Error(
                            result.error.message ?: "Failed to register prisoner"
                        )
                    }
                    else -> {}
                }
            }
        }
    }

    fun resetState() {
        _registrationState.value = RegistrationState.Idle
    }

    sealed class RegistrationState {
        object Idle : RegistrationState()
        object Loading : RegistrationState()
        data class Success(val prisonerId: String, val message: String) : RegistrationState()
        data class Error(val message: String) : RegistrationState()
    }
}
