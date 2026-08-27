package com.prisonconnect.kiosk.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.models.admin.CreateContactRequest
import com.prisonconnect.kiosk.models.admin.UpdateContactRequest
import com.prisonconnect.kiosk.models.admin.UpdateContactStatusRequest
import com.prisonconnect.kiosk.models.admin.VerifiedContact
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AdminRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ManageContactsViewModel @Inject constructor(
    private val adminRepository: AdminRepository
) : ViewModel() {

    private val _contacts = MutableStateFlow<NetworkResult<List<VerifiedContact>>>(NetworkResult.Idle)
    val contacts: StateFlow<NetworkResult<List<VerifiedContact>>> = _contacts.asStateFlow()

    private val _addContactState = MutableStateFlow<NetworkResult<VerifiedContact>>(NetworkResult.Idle)
    val addContactState: StateFlow<NetworkResult<VerifiedContact>> = _addContactState.asStateFlow()

    private val _editContactState = MutableStateFlow<NetworkResult<VerifiedContact>>(NetworkResult.Idle)
    val editContactState: StateFlow<NetworkResult<VerifiedContact>> = _editContactState.asStateFlow()

    private val _deleteContactState = MutableStateFlow<NetworkResult<Unit>>(NetworkResult.Idle)
    val deleteContactState: StateFlow<NetworkResult<Unit>> = _deleteContactState.asStateFlow()

    fun loadContacts(prisonerId: String) {
        viewModelScope.launch {
            adminRepository.getPrisonerContacts(prisonerId).collect { result ->
                // Skip Loading if we already have data — prevents list disappearing
                if (result is NetworkResult.Loading && _contacts.value is NetworkResult.Success) {
                    return@collect
                }
                _contacts.value = result
            }
        }
    }

    fun addContact(prisonerId: String, name: String, mobileNumber: String, relationship: String) {
        _addContactState.value = NetworkResult.Loading
        val request = CreateContactRequest(
            name = name,
            mobileNumber = mobileNumber,
            relationship = relationship,
            verified = true
        )
        viewModelScope.launch {
            adminRepository.createContact(prisonerId, request).collect { result ->
                _addContactState.value = result
                if (result is NetworkResult.Success) {
                    loadContacts(prisonerId)
                }
            }
        }
    }

    fun editContact(contactId: String, prisonerId: String, name: String, mobileNumber: String, relationship: String) {
        _editContactState.value = NetworkResult.Loading
        val request = UpdateContactRequest(
            name = name,
            mobileNumber = mobileNumber,
            relationship = relationship
        )
        viewModelScope.launch {
            adminRepository.updateContact(contactId, request).collect { result ->
                _editContactState.value = result
                if (result is NetworkResult.Success) {
                    loadContacts(prisonerId)
                }
            }
        }
    }

    fun toggleContactStatus(contactId: String, prisonerId: String, active: Boolean) {
        viewModelScope.launch {
            adminRepository.updateContactStatus(contactId, UpdateContactStatusRequest(active)).collect { result ->
                if (result is NetworkResult.Success) {
                    loadContacts(prisonerId)
                }
            }
        }
    }

    fun deleteContact(contactId: String, prisonerId: String) {
        _deleteContactState.value = NetworkResult.Loading
        viewModelScope.launch {
            adminRepository.deleteContact(contactId).collect { result ->
                _deleteContactState.value = result
                if (result is NetworkResult.Success) {
                    loadContacts(prisonerId)
                }
            }
        }
    }

    fun resetAddState() {
        _addContactState.value = NetworkResult.Idle
    }

    fun resetEditState() {
        _editContactState.value = NetworkResult.Idle
    }

    fun resetDeleteState() {
        _deleteContactState.value = NetworkResult.Idle
    }
}
