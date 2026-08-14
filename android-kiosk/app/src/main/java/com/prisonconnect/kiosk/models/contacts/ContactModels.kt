package com.prisonconnect.kiosk.models.contacts

import com.google.gson.annotations.SerializedName

data class Contact(
    @SerializedName("id") val id: String,
    @SerializedName("fullName") val fullName: String,
    @SerializedName("relationship") val relationship: String,
    @SerializedName("phoneNumber") val phoneNumber: String,
    @SerializedName("isApproved") val isApproved: Boolean,
    @SerializedName("photoUrl") val photoUrl: String? = null,
    @SerializedName("lastCallDate") val lastCallDate: String? = null,
    @SerializedName("nextScheduledCallDate") val nextScheduledCallDate: String? = null
)
