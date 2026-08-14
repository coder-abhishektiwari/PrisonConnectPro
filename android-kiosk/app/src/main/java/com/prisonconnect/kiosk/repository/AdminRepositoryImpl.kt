package com.prisonconnect.kiosk.repository

import com.prisonconnect.kiosk.datasource.AdminDataSource
import com.prisonconnect.kiosk.models.admin.*
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.models.common.ApiError
import com.prisonconnect.kiosk.network.NetworkResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AdminRepositoryImpl @Inject constructor(
    private val dataSource: AdminDataSource
) : AdminRepository {

    override fun getPrisoners(): Flow<NetworkResult<List<Prisoner>>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.getPrisoners()
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun getPrisoner(prisonerId: String): Flow<NetworkResult<Prisoner>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.getPrisoner(prisonerId)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun createPrisoner(request: CreatePrisonerRequest): Flow<NetworkResult<Prisoner>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.createPrisoner(request)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun editPrisoner(prisonerId: String, request: EditPrisonerRequest): Flow<NetworkResult<Prisoner>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.editPrisoner(prisonerId, request)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun updatePrisonerStatus(prisonerId: String, request: UpdatePrisonerStatusRequest): Flow<NetworkResult<Prisoner>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.updatePrisonerStatus(prisonerId, request)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun getPrisonerContacts(prisonerId: String): Flow<NetworkResult<List<VerifiedContact>>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.getPrisonerContacts(prisonerId)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun createContact(prisonerId: String, request: CreateContactRequest): Flow<NetworkResult<VerifiedContact>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.createContact(prisonerId, request)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun updateContact(contactId: String, request: UpdateContactRequest): Flow<NetworkResult<VerifiedContact>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.updateContact(contactId, request)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun updateContactStatus(contactId: String, request: UpdateContactStatusRequest): Flow<NetworkResult<VerifiedContact>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.updateContactStatus(contactId, request)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun getPrisonerBiometrics(prisonerId: String): Flow<NetworkResult<List<BiometricRegistration>>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.getPrisonerBiometrics(prisonerId)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override suspend fun registerBiometric(prisonerId: String, request: RegisterBiometricRequest): NetworkResult<BiometricRegistration> {
        return try {
            val response = dataSource.registerBiometric(prisonerId, request)
            if (response.success && response.data != null) {
                NetworkResult.Success(response.data)
            } else {
                NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error"))
            }
        } catch (e: Exception) {
            NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception"))
        }
    }

    override fun deleteBiometric(biometricId: String): Flow<NetworkResult<Unit>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.deleteBiometric(biometricId)
            if (response.success) {
                emit(NetworkResult.Success(Unit))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun getDevices(): Flow<NetworkResult<List<KioskDevice>>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.getDevices()
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun getDevice(deviceId: String): Flow<NetworkResult<KioskDevice>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.getDevice(deviceId)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun getAdminProfile(): Flow<NetworkResult<AdminProfile>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.getAdminProfile()
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
