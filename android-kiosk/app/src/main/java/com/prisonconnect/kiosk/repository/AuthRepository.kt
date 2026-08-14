package com.prisonconnect.kiosk.repository

import android.graphics.Bitmap
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.models.auth.AdminVerifyPasswordRequest
import com.prisonconnect.kiosk.models.auth.AuthToken
import com.prisonconnect.kiosk.models.auth.KioskVerifyRequest
import com.prisonconnect.kiosk.models.auth.KioskVerifyResponse
import com.prisonconnect.kiosk.models.auth.LoginRequest
import com.prisonconnect.kiosk.models.auth.KioskInfo
import com.prisonconnect.kiosk.network.NetworkResult
import kotlinx.coroutines.flow.Flow

import com.prisonconnect.kiosk.models.inmate.InmateProfile

interface AuthRepository {
    fun login(request: LoginRequest): Flow<NetworkResult<AuthToken>>
    fun refreshToken(): Flow<NetworkResult<AuthToken>>
    fun logout(): Flow<NetworkResult<Unit>>
    fun identifyFace(image: Bitmap): Flow<NetworkResult<InmateProfile>>
    fun identifyFingerprint(capture: ByteArray): Flow<NetworkResult<InmateProfile>>
    fun identifyRfid(request: LoginRequest): Flow<NetworkResult<InmateProfile>>
    fun identifyPrisoner(id: String): Flow<NetworkResult<InmateProfile>>
    fun verifyPin(inmateId: String, pin: String): Flow<NetworkResult<AuthToken>>
    fun verifyKiosk(request: KioskVerifyRequest): Flow<NetworkResult<KioskVerifyResponse>>
    fun getVerifiedKiosk(): KioskInfo?
    suspend fun getInmateId(): String?
    suspend fun hasValidSession(): Boolean
    suspend fun hasSession(): Boolean
    fun isDeviceAuthorized(): Flow<Boolean>

    // Admin authentication
    fun adminLogin(request: LoginRequest): Flow<NetworkResult<AdminProfile>>
    fun adminVerifyPassword(request: AdminVerifyPasswordRequest): Flow<NetworkResult<AuthToken>>

    // Kiosk Registration & Authorization
    fun getPrisonList(): Flow<NetworkResult<List<com.prisonconnect.kiosk.models.auth.Prison>>>
    fun validateSetupPin(prisonId: String, pin: String): Flow<NetworkResult<com.prisonconnect.kiosk.models.auth.ValidateSetupPinResponse>>
    fun registerKiosk(request: com.prisonconnect.kiosk.models.auth.KioskRegistrationRequest): Flow<NetworkResult<com.prisonconnect.kiosk.models.auth.KioskRegistrationResponse>>
    fun getRegistrationStatus(serialNumber: String): Flow<NetworkResult<com.prisonconnect.kiosk.models.auth.RegistrationStatusResponse>>
}

