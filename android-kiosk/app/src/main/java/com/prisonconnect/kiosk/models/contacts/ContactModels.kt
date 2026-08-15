package com.prisonconnect.kiosk.models.contacts

import com.google.gson.annotations.SerializedName

data class Contact(
    @SerializedName("contactId") val id: String,
    @SerializedName("fullName") val fullName: String,
    @SerializedName("relationship") val relationship: String = "",
    @SerializedName("phoneNumber") val phoneNumber: String = "",
    @SerializedName("photo") val photoUrl: String? = null,
    @SerializedName("lastCall") val lastCallDate: String? = null,
    @SerializedName("nextScheduledCall") val nextScheduledCallDate: String? = null,
    @SerializedName("approvalStatus") val approvalStatus: String? = null
) {
    val isApproved: Boolean get() = approvalStatus?.equals("approved", ignoreCase = true) == true
}