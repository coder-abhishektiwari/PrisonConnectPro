package com.prisonconnect.kiosk.datasource.remote

import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.datasource.ContactDataSource
import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.contacts.Contact
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteContactDataSource @Inject constructor(
    private val apiService: TrustApiService
) : ContactDataSource {
    override suspend fun getContacts(id: String): ApiResponse<List<Contact>> =
        apiService.getContacts(id)
}
