package com.prisonconnect.kiosk.models.inmate

import com.google.gson.annotations.SerializedName

data class InmateProfile(
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("firstName") val firstName: String,
    @SerializedName("lastName") val lastName: String,
    @SerializedName("prisonId") val prisonId: String,
    @SerializedName("facility") val facility: String,
    @SerializedName("cellBlock") val cellBlock: String,
    @SerializedName("status") val status: InmateStatus,
    @SerializedName("photoUrl") val photoUrl: String? = null,
    @SerializedName("securityLevel") val securityLevel: String? = null,
    @SerializedName("sentenceDetails") val sentenceDetails: String? = null
)

enum class InmateStatus {
    @SerializedName("active") ACTIVE,
    @SerializedName("restricted") RESTRICTED,
    @SerializedName("suspended") SUSPENDED
}

data class InmateBalance(
    @SerializedName("balance") val credits: Double = 0.0,
    @SerializedName("currency") val currency: String = "INR",
    @SerializedName("lastRecharge") val lastRechargeDate: String? = null,
    @SerializedName("totalSpent") val totalSpent: Double? = null,
    @SerializedName("remainingMinutes") val remainingMinutes: Int? = null,
    val lastRechargeAmount: Double? = null
)
