package com.prisonconnect.kiosk.api

import com.prisonconnect.kiosk.models.admin.*
import com.prisonconnect.kiosk.models.auth.*
import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.models.call.ScheduledCall
import com.prisonconnect.kiosk.models.call.CallHistory
import com.prisonconnect.kiosk.models.call.CallSession
import com.prisonconnect.kiosk.models.call.CreateCallRequest
import com.prisonconnect.kiosk.models.call.RecordingUploadRequest
import com.prisonconnect.kiosk.models.call.RecordingUploadResponse
import com.prisonconnect.kiosk.models.call.CallStatusSnapshot
import com.prisonconnect.kiosk.models.schedule.SlotsResponse
import com.prisonconnect.kiosk.models.schedule.ScheduleRequest
import com.prisonconnect.kiosk.models.wallet.WalletStatement
import retrofit2.http.*

/**
 * Main API service for the Prison Trust Gateway.
 * All responses are wrapped in [ApiResponse].
 */
interface TrustApiService {

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): ApiResponse<AuthToken>

    @POST("auth/refresh")
    suspend fun refreshToken(@Body request: RefreshTokenRequest): ApiResponse<AuthToken>

    @POST("auth/logout")
    suspend fun logout(@Header("Authorization") authorization: String): ApiResponse<Unit>

    @POST("auth/admin/identify")
    suspend fun adminIdentify(@Body request: LoginRequest): ApiResponse<AdminProfile>

    @POST("auth/admin/verify-pin")
    suspend fun adminVerifyPassword(@Body request: AdminVerifyPasswordRequest): ApiResponse<AuthToken>

    @GET("admin/profile")
    suspend fun getAdminProfile(): ApiResponse<AdminProfile>

    @POST("auth/face-identify")
    suspend fun identifyFace(
        @Body request: FaceIdentifyRequest
    ): ApiResponse<InmateProfile>

    @POST("auth/fingerprint-identify")
    suspend fun identifyFingerprint(
        @Body request: FingerprintIdentifyRequest
    ): ApiResponse<InmateProfile>

    @POST("auth/rfid-identify")
    suspend fun identifyRfid(@Body request: LoginRequest): ApiResponse<InmateProfile>

    @POST("auth/prisoner/identify")
    suspend fun identifyPrisoner(
        @Body request: LoginRequest
    ): ApiResponse<InmateProfile>

    @POST("auth/verify-pin")
    suspend fun verifyPin(@Body request: PinVerifyRequest): ApiResponse<AuthToken>

    @POST("kiosks/verify")
    suspend fun verifyKiosk(@Body request: KioskVerifyRequest): ApiResponse<KioskVerifyResponse>

    @GET("prisons/list")
    suspend fun getPrisonList(): ApiResponse<List<Prison>>

    @POST("kiosks/validate-setup-pin")
    suspend fun validateSetupPin(@Body request: ValidateSetupPinRequest): ApiResponse<ValidateSetupPinResponse>

    @POST("kiosks/register")
    suspend fun registerKiosk(@Body request: KioskRegistrationRequest): ApiResponse<KioskRegistrationResponse>

    @GET("kiosks/registration-status/{serialNumber}")
    suspend fun getRegistrationStatus(@Path("serialNumber") serialNumber: String): ApiResponse<RegistrationStatusResponse>


    @GET("inmate/profile/{id}")
    suspend fun getInmateProfile(@Path("id") id: String): ApiResponse<InmateProfile>

    @GET("inmate/balance/{id}")
    suspend fun getInmateBalance(@Path("id") id: String): ApiResponse<InmateBalance>

    @GET("inmate/wallet/{id}")
    suspend fun getWalletStatement(@Path("id") id: String): ApiResponse<WalletStatement>

    @GET("contacts/{id}")
    suspend fun getContacts(@Path("id") id: String): ApiResponse<List<Contact>>

    @GET("calls/scheduled/{id}")
    suspend fun getScheduledCalls(@Path("id") id: String): ApiResponse<List<ScheduledCall>>

    @GET("calls/history/{id}")
    suspend fun getCallHistory(@Path("id") id: String): ApiResponse<List<CallHistory>>

    @GET("schedule/slots/{kioskId}/{date}")
    suspend fun getBookedSlots(@Path("kioskId") kioskId: String, @Path("date") date: String): ApiResponse<com.prisonconnect.kiosk.models.schedule.SlotsResponse>

    @POST("schedule/book")
    suspend fun bookCall(@Body request: ScheduleRequest): ApiResponse<ScheduledCall>

    @POST("calls")
    suspend fun createCall(@Body request: CreateCallRequest): ApiResponse<CallSession>

    @GET("calls/{callId}")
    suspend fun getCallStatus(@Path("callId") callId: String): ApiResponse<CallStatusSnapshot>

    /** Finalize a call (sets endTime/duration) when it ends. */
    @POST("calls/{callId}/end")
    suspend fun endCall(@Path("callId") callId: String): ApiResponse<*>

    @POST("recordings/upload")
    suspend fun uploadRecording(@Body request: RecordingUploadRequest): ApiResponse<RecordingUploadResponse>

    @DELETE("schedule/cancel/{bookingId}")
    suspend fun cancelBooking(@Path("bookingId") bookingId: String): ApiResponse<Unit>

    @GET("settings")
    suspend fun getSettings(): ApiResponse<com.google.gson.JsonObject>

    // ==================== ADMIN ENDPOINTS ====================

    // Prisoners
    @GET("admin/prisoners")
    suspend fun getAdminPrisoners(): ApiResponse<List<Prisoner>>

    @GET("admin/prisoners/{prisonerId}")
    suspend fun getAdminPrisoner(@Path("prisonerId") prisonerId: String): ApiResponse<Prisoner>

    @POST("admin/prisoners")
    suspend fun createPrisoner(@Body request: CreatePrisonerRequest): ApiResponse<Prisoner>

    @PUT("admin/prisoners/{prisonerId}")
    @JvmSuppressWildcards
    suspend fun editPrisoner(
        @Path("prisonerId") prisonerId: String,
        @Body request: EditPrisonerRequest
    ): ApiResponse<Prisoner>

    @PUT("admin/prisoners/{prisonerId}")
    suspend fun updatePrisoner(@Path("prisonerId") prisonerId: String, @Body prisoner: Prisoner): ApiResponse<Prisoner>

    @PATCH("admin/prisoners/{prisonerId}/status")
    suspend fun updatePrisonerStatus(
        @Path("prisonerId") prisonerId: String,
        @Body request: UpdatePrisonerStatusRequest
    ): ApiResponse<Prisoner>

    @DELETE("admin/prisoners/{prisonerId}")
    suspend fun deletePrisoner(@Path("prisonerId") prisonerId: String): ApiResponse<Unit>

    // Contacts
    @GET("admin/prisoners/{prisonerId}/contacts")
    suspend fun getPrisonerContacts(@Path("prisonerId") prisonerId: String): ApiResponse<List<VerifiedContact>>

    @POST("admin/prisoners/{prisonerId}/contacts")
    suspend fun createContact(
        @Path("prisonerId") prisonerId: String,
        @Body request: CreateContactRequest
    ): ApiResponse<VerifiedContact>

    @PUT("admin/contacts/{contactId}")
    suspend fun updateContact(
        @Path("contactId") contactId: String,
        @Body request: UpdateContactRequest
    ): ApiResponse<VerifiedContact>

    @PATCH("admin/contacts/{contactId}/status")
    suspend fun updateContactStatus(
        @Path("contactId") contactId: String,
        @Body request: UpdateContactStatusRequest
    ): ApiResponse<VerifiedContact>

    @DELETE("admin/contacts/{contactId}")
    suspend fun deleteContact(@Path("contactId") contactId: String): ApiResponse<Unit>

    // Biometrics
    @GET("admin/prisoners/{prisonerId}/biometrics")
    suspend fun getPrisonerBiometrics(@Path("prisonerId") prisonerId: String): ApiResponse<List<BiometricRegistration>>

    @POST("admin/prisoners/{prisonerId}/biometrics")
    suspend fun registerBiometric(
        @Path("prisonerId") prisonerId: String,
        @Body request: RegisterBiometricRequest
    ): ApiResponse<BiometricRegistration>

    @DELETE("admin/biometrics/{biometricId}")
    suspend fun deleteBiometric(@Path("biometricId") biometricId: String): ApiResponse<Unit>

    // Devices
    @GET("admin/devices")
    suspend fun getAdminDevices(): ApiResponse<List<KioskDevice>>

    @GET("admin/devices/{deviceId}")
    suspend fun getAdminDevice(@Path("deviceId") deviceId: String): ApiResponse<KioskDevice>
}
