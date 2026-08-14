package com.prisonconnect.kiosk.datasource.remote

import android.graphics.Bitmap
import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.datasource.AuthDataSource
import com.prisonconnect.kiosk.models.auth.*
import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteAuthDataSource @Inject constructor(
    private val apiService: TrustApiService
) : AuthDataSource {
    override suspend fun login(request: LoginRequest): ApiResponse<AuthToken> =
        apiService.login(request)

    override suspend fun refreshToken(refreshToken: String): ApiResponse<AuthToken> =
        apiService.refreshToken(RefreshTokenRequest(refreshToken))

    override suspend fun logout(accessToken: String): ApiResponse<Unit> =
        apiService.logout("Bearer $accessToken")

    override suspend fun identifyFace(kioskId: String, image: Bitmap): ApiResponse<InmateProfile> {
        val kioskIdBody = kioskId.toRequestBody("text/plain".toMediaTypeOrNull())

        val stream = ByteArrayOutputStream()
        image.compress(Bitmap.CompressFormat.JPEG, 90, stream)
        val imageBody = stream.toByteArray().toRequestBody("image/jpeg".toMediaTypeOrNull())
        val imagePart = MultipartBody.Part.createFormData("image", "face.jpg", imageBody)

        return apiService.identifyFace(kioskIdBody, imagePart)
    }

    override suspend fun identifyFingerprint(kioskId: String, capture: ByteArray): ApiResponse<InmateProfile> {
        val kioskIdBody = kioskId.toRequestBody("text/plain".toMediaTypeOrNull())
        val captureBody = capture.toRequestBody("application/octet-stream".toMediaTypeOrNull())
        val capturePart = MultipartBody.Part.createFormData("capture", "fingerprint.bin", captureBody)

        return apiService.identifyFingerprint(kioskIdBody, capturePart)
    }

    override suspend fun identifyRfid(request: LoginRequest): ApiResponse<InmateProfile> =
        apiService.identifyRfid(request)

    override suspend fun identifyPrisoner(kioskId: String, prisonerId: String): ApiResponse<InmateProfile> =
        apiService.identifyPrisoner(LoginRequest(kioskId = kioskId, prisonerId = prisonerId))

    override suspend fun verifyPin(request: PinVerifyRequest): ApiResponse<AuthToken> =
        apiService.verifyPin(request)

    override suspend fun verifyKiosk(request: KioskVerifyRequest): ApiResponse<KioskVerifyResponse> =
        apiService.verifyKiosk(request)

    override suspend fun adminIdentify(request: LoginRequest): ApiResponse<AdminProfile> =
        apiService.adminIdentify(request)

    override suspend fun adminVerifyPassword(adminId: String, password: String, kioskId: String): ApiResponse<AuthToken> {
        val request = AdminVerifyPasswordRequest(adminId, password, kioskId)
        return apiService.adminVerifyPassword(request)
    }

    override suspend fun getPrisonList(): ApiResponse<List<Prison>> =
        apiService.getPrisonList()

    override suspend fun validateSetupPin(request: ValidateSetupPinRequest): ApiResponse<ValidateSetupPinResponse> =
        apiService.validateSetupPin(request)

    override suspend fun registerKiosk(request: KioskRegistrationRequest): ApiResponse<KioskRegistrationResponse> =
        apiService.registerKiosk(request)

    override suspend fun getRegistrationStatus(serialNumber: String): ApiResponse<RegistrationStatusResponse> =
        apiService.getRegistrationStatus(serialNumber)
}

