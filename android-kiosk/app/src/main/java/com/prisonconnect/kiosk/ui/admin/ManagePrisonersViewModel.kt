package com.prisonconnect.kiosk.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.models.admin.Prisoner
import com.prisonconnect.kiosk.models.admin.UpdatePrisonerStatusRequest
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AdminRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ManagePrisonersViewModel @Inject constructor(
    private val adminRepository: AdminRepository
) : ViewModel() {

    private val _prisoners = MutableStateFlow<List<Prisoner>>(emptyList())
    val prisoners: StateFlow<List<Prisoner>> = _prisoners.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()

    init {
        loadPrisoners()
    }

    fun refreshPrisoners() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            adminRepository.getPrisoners().collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _prisoners.value = result.data
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

    fun loadPrisoners() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            adminRepository.getPrisoners().collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _prisoners.value = result.data
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

    fun refresh() {
        if (_isRefreshing.value) return
        viewModelScope.launch {
            _isRefreshing.value = true
            _error.value = null
            adminRepository.getPrisoners().collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _prisoners.value = result.data
                        _isRefreshing.value = false
                    }
                    is NetworkResult.Failure -> {
                        _error.value = result.error.message
                        _isRefreshing.value = false
                    }
                    else -> {}
                }
            }
        }
    }

    fun updateSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun getFilteredPrisoners(): List<Prisoner> {
        val query = _searchQuery.value
        if (query.isEmpty()) return _prisoners.value
        return _prisoners.value.filter { prisoner ->
            prisoner.displayName.contains(query, ignoreCase = true) ||
                prisoner.inmateId.contains(query, ignoreCase = true) ||
                (prisoner.cellBlock ?: "").contains(query, ignoreCase = true) ||
                (prisoner.prisonerNumber ?: "").contains(query, ignoreCase = true)
        }
    }

    fun deactivatePrisoner(prisonerId: String) {
        viewModelScope.launch {
            adminRepository.updatePrisonerStatus(
                prisonerId,
                UpdatePrisonerStatusRequest(status = "suspended", active = false)
            ).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _prisoners.value = _prisoners.value.map {
                            if (it.inmateId == prisonerId) result.data else it
                        }
                    }
                    is NetworkResult.Failure -> {
                        _error.value = result.error.message
                    }
                    else -> {}
                }
            }
        }
    }

    fun activatePrisoner(prisonerId: String) {
        viewModelScope.launch {
            adminRepository.updatePrisonerStatus(
                prisonerId,
                UpdatePrisonerStatusRequest(status = "active", active = true)
            ).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _prisoners.value = _prisoners.value.map {
                            if (it.inmateId == prisonerId) result.data else it
                        }
                    }
                    is NetworkResult.Failure -> {
                        _error.value = result.error.message
                    }
                    else -> {}
                }
            }
        }
    }

    fun deletePrisoner(prisonerId: String) {
        viewModelScope.launch {
            // For now, just remove from local list
            // Backend DELETE endpoint exists but we'll use it when needed
            _prisoners.value = _prisoners.value.filter { it.inmateId != prisonerId }
        }
    }
}
