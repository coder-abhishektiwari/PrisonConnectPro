package com.prisonconnect.kiosk.models.auth

import com.google.gson.annotations.SerializedName

data class AdminProfile(
    @SerializedName("adminId") val adminId: String,
    @SerializedName("employeeId") val employeeId: String,
    @SerializedName("name") val name: String,
    @SerializedName("email") val email: String,
    @SerializedName("role") val role: String,
    @SerializedName("permissions") val permissions: List<String>,
    @SerializedName("status") val status: String
)

data class AdminLoginRequest(
    @SerializedName("kioskId") val kioskId: String,
    @SerializedName("adminId") val adminId: String? = null,
    @SerializedName("rfidToken") val rfidToken: String? = null,
    @SerializedName("biometricToken") val biometricToken: String? = null
)

data class AdminVerifyPasswordRequest(
    @SerializedName("adminId") val adminId: String,
    @SerializedName("password") val password: String,
    @SerializedName("kioskId") val kioskId: String
)
