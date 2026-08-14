package com.prisonconnect.kiosk.ui.dashboard

import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.InmateRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class InmateProfileViewModel @Inject constructor(
    private val inmateRepository: InmateRepository,
    private val authRepository: AuthRepository
) : BaseViewModel() {

    private val _profileState = MutableStateFlow<UiState<InmateFullDetails>>(UiState.Loading)
    val profileState = _profileState.asStateFlow()

    init {
        loadProfile()
    }

    fun loadProfile() {
        viewModelScope.launch {
            _profileState.value = UiState.Loading
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID

            combine(
                inmateRepository.getProfile(inmateId),
                inmateRepository.getBalance(inmateId)
            ) { profileResult, balanceResult ->
                val profile = (profileResult as? com.prisonconnect.kiosk.network.NetworkResult.Success)?.data
                val balance = (balanceResult as? com.prisonconnect.kiosk.network.NetworkResult.Success)?.data

                if (profile != null && balance != null) {
                    UiState.Success(InmateFullDetails(profile, balance))
                } else {
                    val error = (profileResult as? com.prisonconnect.kiosk.network.NetworkResult.Failure)?.error?.message
                        ?: (balanceResult as? com.prisonconnect.kiosk.network.NetworkResult.Failure)?.error?.message
                        ?: "Failed to load profile details"
                    UiState.Error(error)
                }
            }.collect {
                _profileState.value = it
            }
        }
    }

    data class InmateFullDetails(
        val profile: InmateProfile,
        val balance: InmateBalance
    )
}
