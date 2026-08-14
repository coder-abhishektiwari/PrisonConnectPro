package com.prisonconnect.kiosk.ui.receipt

import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.InmateRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SummaryViewModel @Inject constructor(
    private val inmateRepository: InmateRepository,
    private val authRepository: AuthRepository
) : BaseViewModel() {

    private val _inmateProfile = MutableStateFlow<InmateProfile?>(null)
    val inmateProfile = _inmateProfile.asStateFlow()

    init {
        loadProfile()
    }

    private fun loadProfile() {
        viewModelScope.launch {
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            inmateRepository.getProfile(inmateId).collect { result ->
                if (result is NetworkResult.Success) {
                    _inmateProfile.value = result.data
                }
            }
        }
    }

    fun onPrintReceipt() {
        Logger.d("Receipt printing triggered...")
    }
}
