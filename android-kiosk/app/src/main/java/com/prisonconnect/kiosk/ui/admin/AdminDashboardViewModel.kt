package com.prisonconnect.kiosk.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.core.SessionManager
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AdminRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AdminDashboardViewModel @Inject constructor(
    private val adminRepository: AdminRepository,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _adminProfile = MutableStateFlow<AdminProfile?>(null)
    val adminProfile: StateFlow<AdminProfile?> = _adminProfile.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        loadAdminProfile()
    }

    fun loadAdminProfile() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null

            // Try to fetch from backend first
            adminRepository.getAdminProfile().collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _adminProfile.value = result.data
                        // Update session with latest data
                        sessionManager.saveAdminProfile(result.data)
                        _isLoading.value = false
                    }
                    is NetworkResult.Failure -> {
                        // If backend fetch fails, fall back to cached session data
                        Logger.w("AdminDashboardViewModel: Failed to fetch admin profile from backend: ${result.error.message}")
                        _adminProfile.value = sessionManager.getAdminProfile()
                        _error.value = "Can't fetch profile. Showing cached data."
                        _isLoading.value = false
                    }
                    else -> {}
                }
            }
        }
    }
}
