package com.prisonconnect.kiosk.models.contacts

import com.google.gson.annotations.SerializedName

data class Contact(
    @SerializedName("contactId") val id: String,
    @SerializedName("name") val name: String = "",
    @SerializedName("fullName") val fullName: String = "",
    @SerializedName("relationship") val relationship: String = "",
    @SerializedName("phoneNumber") val phoneNumber: String = "",
    @SerializedName("photo") val photoUrl: String? = null,
    @SerializedName("lastCall") val lastCallDate: String? = null,
    @SerializedName("nextScheduledCall") val nextScheduledCallDate: String? = null
) {
    val displayName: String get() = name.ifEmpty { fullName }
}