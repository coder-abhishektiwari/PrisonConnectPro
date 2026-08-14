package com.prisonconnect.kiosk.datasource

import android.graphics.Bitmap
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.models.auth.AuthToken
import com.prisonconnect.kiosk.models.auth.KioskVerifyRequest
import com.prisonconnect.kiosk.models.auth.KioskVerifyResponse
import com.prisonconnect.kiosk.models.auth.LoginRequest
import com.prisonconnect.kiosk.models.auth.PinVerifyRequest
import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.inmate.InmateProfile

interface AuthDataSource {
    suspend fun login(request: LoginRequest): ApiResponse<AuthToken>
    suspend fun refreshToken(refreshToken: String): ApiResponse<AuthToken>
    suspend fun logout(accessToken: String): ApiResponse<Unit>
    suspend fun identifyFace(kioskId: String, image: Bitmap): ApiResponse<InmateProfile>
    suspend fun identifyFingerprint(kioskId: String, capture: ByteArray): ApiResponse<InmateProfile>
    suspend fun identifyRfid(request: LoginRequest): ApiResponse<InmateProfile>
    suspend fun identifyPrisoner(kioskId: String, prisonerId: String): ApiResponse<InmateProfile>
    suspend fun verifyPin(request: PinVerifyRequest): ApiResponse<AuthToken>
    suspend fun verifyKiosk(request: KioskVerifyRequest): ApiResponse<KioskVerifyResponse>

    // Admin authentication
    suspend fun adminIdentify(request: LoginRequest): ApiResponse<AdminProfile>
    suspend fun adminVerifyPassword(adminId: String, password: String, kioskId: String): ApiResponse<AuthToken>

    // Kiosk Registration & Authorization
    suspend fun getPrisonList(): ApiResponse<List<com.prisonconnect.kiosk.models.auth.Prison>>
    suspend fun validateSetupPin(request: com.prisonconnect.kiosk.models.auth.ValidateSetupPinRequest): ApiResponse<com.prisonconnect.kiosk.models.auth.ValidateSetupPinResponse>
    suspend fun registerKiosk(request: com.prisonconnect.kiosk.models.auth.KioskRegistrationRequest): ApiResponse<com.prisonconnect.kiosk.models.auth.KioskRegistrationResponse>
    suspend fun getRegistrationStatus(serialNumber: String): ApiResponse<com.prisonconnect.kiosk.models.auth.RegistrationStatusResponse>
}

