package com.prisonconnect.kiosk.repository

import com.prisonconnect.kiosk.datasource.ContactDataSource
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.models.common.ApiError
import com.prisonconnect.kiosk.network.NetworkResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ContactRepositoryImpl @Inject constructor(
    private val dataSource: ContactDataSource
) : ContactRepository {

    override fun getContacts(id: String): Flow<NetworkResult<List<Contact>>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.getContacts(id)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }
}
