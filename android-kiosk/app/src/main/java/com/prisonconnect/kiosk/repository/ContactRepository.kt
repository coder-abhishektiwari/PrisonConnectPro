package com.prisonconnect.kiosk.repository

import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.network.NetworkResult
import kotlinx.coroutines.flow.Flow

interface ContactRepository {
    fun getContacts(id: String): Flow<NetworkResult<List<Contact>>>
}
