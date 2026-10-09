package com.prisonconnect.kiosk.models.inmate

import com.google.gson.annotations.SerializedName

data class InmateProfile(
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("prisonerNumber") val prisonerNumber: String? = null,
    @SerializedName("name") val name: String = "",
    @SerializedName("firstName") val firstName: String = "",
    @SerializedName("lastName") val lastName: String = "",
    @SerializedName("prisonId") val prisonId: String = "",
    @SerializedName("facility") val facility: String = "",
    @SerializedName("status") val status: InmateStatus? = null,
    @SerializedName("photoUrl") val photoUrl: String? = null,
    @SerializedName("gender") val gender: String? = null,
    @SerializedName("age") val age: String? = null,
    @SerializedName("district") val district: String? = null,
    @SerializedName("state") val state: String? = null,
    @SerializedName("religion") val religion: String? = null,
    @SerializedName("nationality") val nationality: String? = null,
    @SerializedName("dateOfAdmission") val dateOfAdmission: String? = null,
    @SerializedName("rfidCardNumber") val rfidCardNumber: String? = null,
    @SerializedName("rfidRegistered") val rfidRegistered: Boolean = false
) {
    val displayName: String
        get() = name.ifEmpty { "$firstName $lastName".trim() }.ifEmpty { "Unknown" }
    /** What to SHOW the user: the human prisoner number when it exists. */
    val displayNumber: String
        get() = prisonerNumber?.takeIf { it.isNotBlank() } ?: inmateId
    val isActive: Boolean
        get() = status == InmateStatus.ACTIVE
}

enum class InmateStatus {
    @SerializedName("active") ACTIVE,
    @SerializedName("inactive") INACTIVE,
    @SerializedName("restricted") RESTRICTED,
    @SerializedName("suspended") SUSPENDED,
    @SerializedName("released") RELEASED,
    @SerializedName("transferred") TRANSFERRED
}

data class InmateBalance(
    @SerializedName("balance") val credits: Double = 0.0,
    @SerializedName("currency") val currency: String = "INR",
    @SerializedName("lastRecharge") val lastRechargeDate: String? = null,
    @SerializedName("totalSpent") val totalSpent: Double? = null,
    @SerializedName("remainingMinutes") val remainingMinutes: Int? = null,
    val lastRechargeAmount: Double? = null
)
