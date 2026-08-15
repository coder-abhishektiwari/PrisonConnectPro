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
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("kioskId") val kioskId: String,
    @SerializedName("contactId") val contactId: String,
    @SerializedName("date") val date: String,
    @SerializedName("timeSlot") val timeSlot: String,
    @SerializedName("callType") val callType: String
)
