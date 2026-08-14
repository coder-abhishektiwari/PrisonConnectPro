package com.prisonconnect.kiosk.ui.dashboard

import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.call.ScheduledCall
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.ContactRepository
import com.prisonconnect.kiosk.repository.InmateRepository
import com.prisonconnect.kiosk.repository.CallRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val inmateRepository: InmateRepository,
    private val contactRepository: ContactRepository,
    private val callRepository: CallRepository,
    private val authRepository: AuthRepository
) : BaseViewModel() {

    private val _dashboardState = MutableStateFlow<UiState<DashboardData>>(UiState.Loading)
    val dashboardState = _dashboardState.asStateFlow()

    private val _inmateProfile = MutableStateFlow<InmateProfile?>(null)
    val inmateProfile = _inmateProfile.asStateFlow()

    private val _inmateBalance = MutableStateFlow<InmateBalance?>(null)
    val inmateBalance = _inmateBalance.asStateFlow()

    private val _contacts = MutableStateFlow<List<Contact>>(emptyList())
    val contacts = _contacts.asStateFlow()

    private val _scheduledCalls = MutableStateFlow<List<ScheduledCall>>(emptyList())
    val scheduledCalls = _scheduledCalls.asStateFlow()

    init {
        loadDashboardData()
    }

    fun loadDashboardData() {
        viewModelScope.launch {
            _dashboardState.value = UiState.Loading
            val inmateId = authRepository.getInmateId()

            if (inmateId == null) {
                _dashboardState.value = UiState.Error("No active session found. Please login again.")
                return@launch
            }

            combine(
                inmateRepository.getProfile(inmateId),
                inmateRepository.getBalance(inmateId),
                contactRepository.getContacts(inmateId),
                callRepository.getScheduledCalls(inmateId)
            ) { profile, balance, contacts, calls ->
                val p = (profile as? NetworkResult.Success)?.data
                val b = (balance as? NetworkResult.Success)?.data
                val c = (contacts as? NetworkResult.Success)?.data?.filter { it.isApproved } ?: emptyList()
                val s = (calls as? NetworkResult.Success)?.data ?: emptyList()

                if (p != null && b != null) {
                    _inmateProfile.value = p
                    _inmateBalance.value = b
                    _contacts.value = c.take(5) // Show top 5 on dashboard
                    _scheduledCalls.value = s
                    UiState.Success(DashboardData(p, b, c, s))
                } else {
                    UiState.Error("Failed to load dashboard data")
                }
            }.collect {
                _dashboardState.value = it
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout().collect { }
        }
    }

    data class DashboardData(
        val profile: InmateProfile,
        val balance: InmateBalance,
        val contacts: List<Contact>,
        val scheduledCalls: List<ScheduledCall>
    )
}
