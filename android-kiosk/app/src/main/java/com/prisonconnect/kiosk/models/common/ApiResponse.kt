package com.prisonconnect.kiosk.models.common

import com.google.gson.annotations.SerializedName

/**
 * Standard API response envelope for all backend communication.
 */
data class ApiResponse<T>(
    @SerializedName("success") val success: Boolean,
    @SerializedName("data") val data: T? = null,
    @SerializedName("error") val error: ApiError? = null,
    @SerializedName("timestamp") val timestamp: Long = System.currentTimeMillis()
)

data class ApiError(
    @SerializedName("code") val code: String,
    @SerializedName("message") val message: String,
    @SerializedName("details") val details: Map<String, String>? = null
)
