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
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ContactDetailViewModel @Inject constructor(
    private val contactRepository: ContactRepository,
    private val authRepository: AuthRepository
) : BaseViewModel() {

    private val _contactState = MutableStateFlow<UiState<Contact>>(UiState.Loading)
    val contactState = _contactState.asStateFlow()

    fun loadContact(contactId: String) {
        viewModelScope.launch {
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            contactRepository.getContacts(inmateId).collect { result ->
                when (result) {
                    is NetworkResult.Loading -> _contactState.value = UiState.Loading
                    is NetworkResult.Success -> {
                        val contact = result.data.find { it.id == contactId }
                        if (contact != null) {
                            _contactState.value = UiState.Success(contact)
                        } else {
                            _contactState.value = UiState.Error("Contact not found")
                        }
                    }
                    is NetworkResult.Failure -> {
                        _contactState.value = UiState.Error(result.error.message ?: "Failed to load contact")
                    }
                    is NetworkResult.Idle -> _contactState.value = UiState.Idle
                }
            }
        }
    }
}
