package com.prisonconnect.kiosk.ui.dashboard

import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.ContactRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ContactListViewModel @Inject constructor(
    private val contactRepository: ContactRepository,
    private val authRepository: AuthRepository
) : BaseViewModel() {

    private var allApprovedContacts: List<Contact> = emptyList()

    private val _uiState = MutableStateFlow<UiState<List<Contact>>>(UiState.Loading)
    val contactsUiState = _uiState.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery = _searchQuery.asStateFlow()

    init {
        loadContacts()
    }

    fun loadContacts() {
        viewModelScope.launch {
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            contactRepository.getContacts(inmateId).collectLatest { result ->
                when (result) {
                    is NetworkResult.Loading -> _uiState.value = UiState.Loading
                    is NetworkResult.Success -> {
                        allApprovedContacts = result.data.filter { it.isApproved }
                        filterAndSearch()
                    }
                    is NetworkResult.Failure -> {
                        _uiState.value = UiState.Error(result.error.message ?: "Failed to load contacts")
                    }
                    is NetworkResult.Idle -> _uiState.value = UiState.Idle
                }
            }
        }
    }

    fun onSearchQueryChange(query: String) {
        _searchQuery.value = query
        filterAndSearch()
    }

    private fun filterAndSearch() {
        val query = _searchQuery.value
        val filtered = if (query.isNullOrBlank()) {
            allApprovedContacts
        } else {
            allApprovedContacts.filter {
                it.fullName.contains(query, ignoreCase = true) ||
                        it.relationship.contains(query, ignoreCase = true) ||
                        it.phoneNumber.contains(query, ignoreCase = true)
            }
        }
        _uiState.value = UiState.Success(filtered)
    }
}
