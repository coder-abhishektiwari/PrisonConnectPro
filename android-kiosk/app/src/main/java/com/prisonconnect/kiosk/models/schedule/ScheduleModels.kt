package com.prisonconnect.kiosk.models.schedule

import com.google.gson.annotations.SerializedName

data class AvailableSlot(
    @SerializedName("slotId") val slotId: String,
    @SerializedName("date") val date: String,
    @SerializedName("startTime") val startTime: String,
    @SerializedName("endTime") val endTime: String,
    @SerializedName("isAvailable") val isAvailable: Boolean
)

data class ScheduleRequest(
    @SerializedName("contactId") val contactId: String,
    @SerializedName("slotId") val slotId: String,
    @SerializedName("callType") val callType: String
)
