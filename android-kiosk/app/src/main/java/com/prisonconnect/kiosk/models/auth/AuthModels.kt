package com.prisonconnect.kiosk.models.auth

import com.google.gson.annotations.SerializedName

data class LoginRequest(
    @SerializedName("kioskId") val kioskId: String,
    @SerializedName("pin") val pin: String? = null,
    @SerializedName("rfidToken") val rfidToken: String? = null,
    @SerializedName("biometricToken") val biometricToken: String? = null,
    @SerializedName("username") val username: String? = null,
    @SerializedName("prisonerId") val prisonerId: String? = null
)

data class AuthToken(
    @SerializedName("accessToken") val accessToken: String,
    @SerializedName("refreshToken") val refreshToken: String,
    @SerializedName("expiresIn") val expiresIn: Long
)

data class RefreshTokenRequest(
    @SerializedName("refreshToken") val refreshToken: String
)

data class UserProfile(
    @SerializedName("userId") val userId: String,
    @SerializedName("role") val role: String,
    @SerializedName("permissions") val permissions: List<String>
)

data class PinVerifyRequest(
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("pin") val pin: String,
    @SerializedName("kioskId") val kioskId: String
)

data class KioskVerifyRequest(
    @SerializedName("deviceSerialNumber") val deviceSerialNumber: String
)

data class KioskVerifyResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("authorized") val authorized: Boolean,
    @SerializedName("kiosk") val kiosk: KioskInfo?
)

data class KioskInfo(
    @SerializedName("kioskId") val kioskId: String,
    @SerializedName("deviceSerialNumber") val deviceSerialNumber: String,
    @SerializedName("prisonId") val prisonId: String?,
    @SerializedName("prisonName") val prisonName: String?,
    @SerializedName("status") val status: String,
    @SerializedName("authorized") val authorized: Boolean,
    @SerializedName("location") val location: String?,
    @SerializedName("ipAddress") val ipAddress: String?
)

data class Prison(
    @SerializedName("prisonId") val prisonId: String,
    @SerializedName("name") val name: String,
    @SerializedName("code") val code: String?,
    @SerializedName("city") val city: String?,
    @SerializedName("state") val state: String?
)

data class ValidateSetupPinRequest(
    @SerializedName("prisonId") val prisonId: String,
    @SerializedName("pin") val pin: String
)

data class ValidateSetupPinResponse(
    @SerializedName("valid") val valid: Boolean,
    @SerializedName("prisonId") val prisonId: String,
    @SerializedName("prisonName") val prisonName: String?
)

data class KioskRegistrationRequest(
    @SerializedName("prisonId") val prisonId: String,
    @SerializedName("deviceSerialNumber") val deviceSerialNumber: String,
    @SerializedName("deviceModel") val deviceModel: String,
    @SerializedName("deviceBrand") val deviceBrand: String,
    @SerializedName("ipAddress") val ipAddress: String,
    @SerializedName("location") val location: String,
    @SerializedName("androidVersion") val androidVersion: String,
    @SerializedName("appVersion") val appVersion: String,
    @SerializedName("deviceFingerprint") val deviceFingerprint: String
)

data class KioskRegistrationResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("kioskId") val kioskId: String? = null,
    @SerializedName("requestId") val requestId: String? = null, // 💡 Make Nullable
    @SerializedName("status") val status: String? = "pending",  // 💡 Make Nullable
    @SerializedName("message") val message: String? = null
)

data class RegistrationStatusResponse(
    @SerializedName("status") val status: String? = "pending", // 💡 Make Nullable
    @SerializedName("requestId") val requestId: String? = null,
    @SerializedName("prisonId") val prisonId: String? = null,
    @SerializedName("authorized") val authorized: Boolean = false
)
