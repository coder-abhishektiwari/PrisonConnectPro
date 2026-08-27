package com.prisonconnect.kiosk.datasource.remote

import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.core.ApiCache
import com.prisonconnect.kiosk.datasource.ContactDataSource
import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.contacts.Contact
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteContactDataSource @Inject constructor(
    private val apiService: TrustApiService,
    private val cache: ApiCache
) : ContactDataSource {
    override suspend fun getContacts(id: String): ApiResponse<List<Contact>> =
        cache.getOrFetch("contacts:$id") { apiService.getContacts(id) }
}
