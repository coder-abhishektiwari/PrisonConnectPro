package com.prisonconnect.kiosk.datasource

import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.contacts.Contact

interface ContactDataSource {
    suspend fun getContacts(id: String): ApiResponse<List<Contact>>
}
