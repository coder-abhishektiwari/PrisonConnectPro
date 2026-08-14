package com.prisonconnect.kiosk.repository

import android.graphics.Bitmap
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.core.SessionManager
import com.prisonconnect.kiosk.datasource.AuthDataSource
import com.prisonconnect.kiosk.models.auth.*
import com.prisonconnect.kiosk.models.common.ApiError
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.network.interceptors.AuthInterceptor
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import retrofit2.HttpException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val dataSource: AuthDataSource,
    private val authInterceptor: AuthInterceptor,
    private val sessionManager: SessionManager
) : AuthRepository {

    private var verifiedKiosk: KioskInfo? = null
    private var currentAdmin: AdminProfile? = null

    override fun getVerifiedKiosk(): KioskInfo? = verifiedKiosk

    override suspend fun getInmateId(): String? = sessionManager.getInmateId()

    override suspend fun hasValidSession(): Boolean = sessionManager.hasValidSession()

    override suspend fun hasSession(): Boolean = sessionManager.hasSession()

    override fun isDeviceAuthorized(): Flow<Boolean> = sessionManager.isDeviceAuthorized

    private fun getFriendlyError(defaultMessage: String, errorCode: String? = null): ApiError {
        return when (errorCode) {
            "UNAUTHORIZED", "TOKEN_EXPIRED", "INVALID_TOKEN" -> ApiError("UNAUTHORIZED", "Unauthorized access. Please contact administrator.")
            "NOT_FOUND", "PRISONER_NOT_FOUND", "ADMIN_NOT_FOUND" -> ApiError("NOT_FOUND", "Record not found. Please try again.")
            "INVALID_CREDENTIALS", "INVALID_PIN", "INVALID_PASSWORD" -> ApiError("INVALID_CREDENTIALS", "Incorrect credentials. Please try again.")
            "KIOSK_NOT_AUTHORIZED", "FORBIDDEN" -> ApiError("FORBIDDEN", "Unauthorized access. Please contact administrator.")
            else -> ApiError("ERROR", defaultMessage)
        }
    }

    override fun login(request: LoginRequest): Flow<NetworkResult<AuthToken>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.login(request)
            if (response.success && response.data != null) {
                sessionManager.saveTokens(response.data)
                authInterceptor.setToken(response.data.accessToken)
                emit(NetworkResult.Success(response.data))
            } else {
                val error = response.error?.let {
                    getFriendlyError(it.message, it.code)
                } ?: ApiError("AUTH_FAILED", "Login failed")
                emit(NetworkResult.Failure(error))
            }
        } catch (e: Exception) {
            val statusCode = if (e is HttpException) e.code() else null
            val error = when {
                statusCode == 401 || statusCode == 403 -> ApiError("UNAUTHORIZED", "Unauthorized access. Please contact administrator.")
                statusCode == 404 -> ApiError("NOT_FOUND", "Record not found. Please try again.")
                else -> ApiError("EXCEPTION", "Network error. Please try again.")
            }
            emit(NetworkResult.Failure(error, statusCode = statusCode))
        }
    }

    override fun refreshToken(): Flow<NetworkResult<AuthToken>> = flow {
        emit(NetworkResult.Loading)
        try {
            val refreshToken = sessionManager.getRefreshToken()
            if (refreshToken.isNullOrBlank()) {
                emit(NetworkResult.Failure(ApiError("NO_SESSION", "Session expired. Please login again.")))
                return@flow
            }

            val response = dataSource.refreshToken(refreshToken)
            if (response.success && response.data != null) {
                sessionManager.saveTokens(response.data)
                authInterceptor.setToken(response.data.accessToken)
                emit(NetworkResult.Success(response.data))
            } else {
                val error = response.error?.let {
                    getFriendlyError(it.message, it.code)
                } ?: ApiError("REFRESH_FAILED", "Session expired. Please login again.")
                emit(NetworkResult.Failure(error))
            }
        } catch (e: Exception) {
            val statusCode = if (e is HttpException) e.code() else null
            val error = when {
                statusCode == 401 || statusCode == 403 -> ApiError("UNAUTHORIZED", "Session expired. Please login again.")
                else -> ApiError("EXCEPTION", "Network error. Please try again.")
            }
            emit(NetworkResult.Failure(error, statusCode = statusCode))
        }
    }

    override fun logout(): Flow<NetworkResult<Unit>> = flow {
        emit(NetworkResult.Loading)
        try {
            val accessToken = sessionManager.getAccessToken()
            if (!accessToken.isNullOrBlank()) {
                try {
                    dataSource.logout(accessToken)
                } catch (e: Exception) {
                    Logger.w("Logout server call failed: ${e.message}")
                }
            }

            sessionManager.clearSession()
            authInterceptor.clearToken()
            verifiedKiosk = null
            currentAdmin = null

            emit(NetworkResult.Success(Unit))
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", "Logout failed")))
        }
    }

    override fun identifyFace(image: Bitmap): Flow<NetworkResult<InmateProfile>> = flow {
        emit(NetworkResult.Loading)
        try {
            val kioskId = verifiedKiosk?.kioskId ?: Constants.KIOSK_ID
            val response = dataSource.identifyFace(kioskId, image)
            if (response.success && response.data != null) {
                sessionManager.saveInmateProfile(response.data)
                emit(NetworkResult.Success(response.data))
            } else {
                val error = response.error?.let {
                    getFriendlyError("Face recognition failed. Please try again.", it.code)
                } ?: ApiError("IDENTIFY_FAILED", "Face recognition failed. Please try again.")
                emit(NetworkResult.Failure(error))
            }
        } catch (e: Exception) {
            val statusCode = if (e is HttpException) e.code() else null
            val error = when {
                statusCode == 401 || statusCode == 403 -> ApiError("UNAUTHORIZED", "Unauthorized access. Please contact administrator.")
                statusCode == 404 -> ApiError("NOT_FOUND", "Face not recognized. Please try again.")
                else -> ApiError("EXCEPTION", "Face recognition failed. Please try again.")
            }
            emit(NetworkResult.Failure(error, statusCode = statusCode))
        }
    }

    override fun identifyFingerprint(capture: ByteArray): Flow<NetworkResult<InmateProfile>> = flow {
        emit(NetworkResult.Loading)
        try {
            val kioskId = verifiedKiosk?.kioskId ?: Constants.KIOSK_ID
            val response = dataSource.identifyFingerprint(kioskId, capture)
            if (response.success && response.data != null) {
                sessionManager.saveInmateProfile(response.data)
                emit(NetworkResult.Success(response.data))
            } else {
                val error = response.error?.let {
                    getFriendlyError("Fingerprint not recognized. Please try again.", it.code)
                } ?: ApiError("IDENTIFY_FAILED", "Fingerprint not recognized. Please try again.")
                emit(NetworkResult.Failure(error))
            }
        } catch (e: Exception) {
            val statusCode = if (e is HttpException) e.code() else null
            val error = when {
                statusCode == 401 || statusCode == 403 -> ApiError("UNAUTHORIZED", "Unauthorized access. Please contact administrator.")
                statusCode == 404 -> ApiError("NOT_FOUND", "Fingerprint not recognized. Please try again.")
                else -> ApiError("EXCEPTION", "Fingerprint recognition failed. Please try again.")
            }
            emit(NetworkResult.Failure(error, statusCode = statusCode))
        }
    }

    override fun identifyRfid(request: LoginRequest): Flow<NetworkResult<InmateProfile>> = flow {
        emit(NetworkResult.Loading)
        try {
            val kioskId = verifiedKiosk?.kioskId ?: Constants.KIOSK_ID
            val rfidRequest = request.copy(kioskId = kioskId)
            val response = dataSource.identifyRfid(rfidRequest)
            if (response.success && response.data != null) {
                sessionManager.saveInmateProfile(response.data)
                emit(NetworkResult.Success(response.data))
            } else {
                val error = response.error?.let {
                    getFriendlyError("RFID card not recognized. Please try again.", it.code)
                } ?: ApiError("IDENTIFY_FAILED", "RFID card not recognized. Please try again.")
                emit(NetworkResult.Failure(error))
            }
        } catch (e: Exception) {
            val statusCode = if (e is HttpException) e.code() else null
            val error = when {
                statusCode == 401 || statusCode == 403 -> ApiError("UNAUTHORIZED", "Unauthorized access. Please contact administrator.")
                statusCode == 404 -> ApiError("NOT_FOUND", "RFID card not recognized. Please try again.")
                else -> ApiError("EXCEPTION", "RFID card not recognized. Please try again.")
            }
            emit(NetworkResult.Failure(error, statusCode = statusCode))
        }
    }

    override fun identifyPrisoner(id: String): Flow<NetworkResult<InmateProfile>> = flow {
        emit(NetworkResult.Loading)
        try {
            val kioskId = verifiedKiosk?.kioskId ?: Constants.KIOSK_ID
            val response = dataSource.identifyPrisoner(kioskId, id)
            if (response.success && response.data != null) {
                sessionManager.saveInmateProfile(response.data)
                emit(NetworkResult.Success(response.data))
            } else {
                val error = response.error?.let {
                    getFriendlyError("Prisoner ID not recognized. Please try again.", it.code)
                } ?: ApiError("IDENTIFY_FAILED", "Prisoner ID not recognized. Please try again.")
                emit(NetworkResult.Failure(error))
            }
        } catch (e: Exception) {
            val statusCode = if (e is HttpException) e.code() else null
            val error = when {
                statusCode == 401 || statusCode == 403 -> ApiError("UNAUTHORIZED", "Unauthorized access. Please contact administrator.")
                statusCode == 404 -> ApiError("NOT_FOUND", "Prisoner ID not found. Please try again.")
                else -> ApiError("EXCEPTION", "Prisoner ID not recognized. Please try again.")
            }
            emit(NetworkResult.Failure(error, statusCode = statusCode))
        }
    }

    override fun verifyPin(inmateId: String, pin: String): Flow<NetworkResult<AuthToken>> = flow {
        emit(NetworkResult.Loading)
        try {
            val kioskId = verifiedKiosk?.kioskId ?: Constants.KIOSK_ID
            val request = PinVerifyRequest(inmateId, pin, kioskId)
            val response = dataSource.verifyPin(request)
            if (response.success && response.data != null) {
                sessionManager.saveTokens(response.data)
                authInterceptor.setToken(response.data.accessToken)
                emit(NetworkResult.Success(response.data))
            } else {
                val error = response.error?.let {
                    when (it.code) {
                        "INVALID_PIN" -> ApiError("INVALID_PIN", "Incorrect PIN. Please try again.")
                        else -> getFriendlyError("PIN verification failed. Please try again.", it.code)
                    }
                } ?: ApiError("PIN_FAILED", "Incorrect PIN. Please try again.")
                emit(NetworkResult.Failure(error))
            }
        } catch (e: Exception) {
            val statusCode = if (e is HttpException) e.code() else null
            val error = when {
                statusCode == 401 || statusCode == 403 -> ApiError("UNAUTHORIZED", "Unauthorized access. Please contact administrator.")
                else -> ApiError("EXCEPTION", "PIN verification failed. Please try again.")
            }
            emit(NetworkResult.Failure(error, statusCode = statusCode))
        }
    }

    override fun verifyKiosk(request: KioskVerifyRequest): Flow<NetworkResult<KioskVerifyResponse>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.verifyKiosk(request)
            if (response.success && response.data != null) {
                if (response.data.authorized && response.data.kiosk != null) {
                    verifiedKiosk = response.data.kiosk.also { sessionManager.saveKioskInfo(it) }
                } else {
                    verifiedKiosk = null
                    // Explicitly save unauthorized state to session manager
                    sessionManager.getKioskInfo()?.let {
                        sessionManager.saveKioskInfo(it.copy(authorized = false))
                    } ?: run {
                        // If no kiosk info exists, we should at least clear or set unauthorized if we had a model for it
                        // For now, if it's unauthorized, the flow in NavHost will catch the default 'false' if we clear it
                        sessionManager.clearSession()
                    }
                }
                emit(NetworkResult.Success(response.data))
            } else {
                verifiedKiosk = null
                val error = response.error?.let {
                    getFriendlyError("Kiosk verification failed. Please contact administrator.", it.code)
                } ?: ApiError("VERIFICATION_FAILED", "Kiosk verification failed. Please contact administrator.")
                emit(NetworkResult.Failure(error))
            }
        } catch (e: Exception) {
            verifiedKiosk = null
            val statusCode = if (e is HttpException) e.code() else null
            if (statusCode == 403) {
                 sessionManager.getKioskInfo()?.let { sessionManager.saveKioskInfo(it.copy(authorized = false)) }
            }
            val error = when {
                statusCode == 401 || statusCode == 403 -> ApiError("UNAUTHORIZED", "Unauthorized access. Please contact administrator.")
                else -> ApiError("EXCEPTION", "Kiosk verification failed. Please contact administrator.")
            }
            emit(NetworkResult.Failure(error, statusCode = statusCode))
        }
    }

    override fun adminLogin(request: LoginRequest): Flow<NetworkResult<AdminProfile>> = flow {
        emit(NetworkResult.Loading)
        try {
            Logger.d("AuthRepository: Requesting adminIdentify for ${request.username} at kiosk ${request.kioskId}")
            val response = dataSource.adminIdentify(request)
            if (response.success && response.data != null) {
                Logger.i("AuthRepository: Admin identified successfully: ${response.data.name}")
                currentAdmin = response.data
                sessionManager.saveAdminProfile(response.data)
                emit(NetworkResult.Success(response.data))
            } else {
                val error = response.error?.let {
                    when (it.code) {
                        "ADMIN_NOT_FOUND" -> ApiError("ADMIN_NOT_FOUND", "Admin not found for this kiosk")
                        else -> getFriendlyError("Admin not found for this kiosk", it.code)
                    }
                } ?: ApiError("AUTH_FAILED", "Admin not found for this kiosk")
                Logger.w("AuthRepository: Admin identify failed: ${error.message}")
                emit(NetworkResult.Failure(error))
            }
        } catch (e: Exception) {
            Logger.e("AuthRepository: Exception during adminIdentify", e)
            val statusCode = if (e is HttpException) e.code() else null
            val error = when {
                statusCode == 401 || statusCode == 403 -> ApiError("UNAUTHORIZED", "Unauthorized access. Please contact administrator.")
                statusCode == 404 -> ApiError("NOT_FOUND", "Admin not found for this kiosk")
                else -> ApiError("EXCEPTION", "Admin not found for this kiosk")
            }
            emit(NetworkResult.Failure(error, statusCode = statusCode))
        }
    }

    override fun adminVerifyPassword(request: AdminVerifyPasswordRequest): Flow<NetworkResult<AuthToken>> = flow {
        emit(NetworkResult.Loading)
        try {
            Logger.d("AuthRepository: Requesting adminVerifyPassword for admin ${request.adminId} at kiosk ${request.kioskId}")
            val response = dataSource.adminVerifyPassword(request.adminId, request.password, request.kioskId)
            if (response.success && response.data != null) {
                Logger.i("AuthRepository: Admin password verified successfully")
                sessionManager.saveTokens(response.data)
                authInterceptor.setToken(response.data.accessToken)
                emit(NetworkResult.Success(response.data))
            } else {
                val error = response.error?.let {
                    when (it.code) {
                        "INVALID_PASSWORD" -> ApiError("INVALID_PASSWORD", "Incorrect password. Please try again.")
                        else -> getFriendlyError("Password verification failed. Please try again.", it.code)
                    }
                } ?: ApiError("PASSWORD_FAILED", "Incorrect password. Please try again.")
                Logger.w("AuthRepository: Admin password verification failed: ${error.message}")
                emit(NetworkResult.Failure(error))
            }
        } catch (e: Exception) {
            Logger.e("AuthRepository: Exception during adminVerifyPassword", e)
            val statusCode = if (e is HttpException) e.code() else null
            val error = when {
                statusCode == 401 || statusCode == 403 -> ApiError("UNAUTHORIZED", "Unauthorized access. Please contact administrator.")
                else -> ApiError("EXCEPTION", "Password verification failed. Please try again.")
            }
            emit(NetworkResult.Failure(error, statusCode = statusCode))
        }
    }

    override fun getPrisonList(): Flow<NetworkResult<List<Prison>>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.getPrisonList()
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(ApiError("FETCH_FAILED", response.error?.message ?: "Failed to fetch prisons")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network error fetching prison list")))
        }
    }

    override fun validateSetupPin(prisonId: String, pin: String): Flow<NetworkResult<ValidateSetupPinResponse>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.validateSetupPin(ValidateSetupPinRequest(prisonId, pin))
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                val msg = response.error?.message ?: "Invalid Setup PIN"
                emit(NetworkResult.Failure(ApiError("INVALID_PIN", msg)))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Error validating setup PIN")))
        }
    }

    override fun registerKiosk(request: KioskRegistrationRequest): Flow<NetworkResult<KioskRegistrationResponse>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.registerKiosk(request)
            if (response.success && response.data != null) {
                sessionManager.saveRegistrationState(
                    status = response.data.status.orEmpty(),
                    prisonId = request.prisonId,
                    requestId = response.data.requestId.orEmpty()
                )
                emit(NetworkResult.Success(response.data))
            } else {
                val msg = response.error?.message ?: "Kiosk registration failed"
                emit(NetworkResult.Failure(ApiError("REGISTRATION_FAILED", msg)))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network error submitting registration")))
        }
    }

    override fun getRegistrationStatus(serialNumber: String): Flow<NetworkResult<RegistrationStatusResponse>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = dataSource.getRegistrationStatus(serialNumber)
            if (response.success && response.data != null) {
                sessionManager.saveRegistrationState(
                    status = response.data.status.orEmpty(),
                    prisonId = response.data.prisonId ?: "",
                    requestId = response.data.requestId ?: ""
                )
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(ApiError("STATUS_CHECK_FAILED", response.error?.message ?: "Failed to check status")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network error checking status")))
        }
    }
}

