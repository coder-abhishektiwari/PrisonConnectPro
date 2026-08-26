package com.prisonconnect.kiosk.models.schedule

import com.google.gson.annotations.SerializedName

data class BookedSlot(
    @SerializedName("scheduleId") val scheduleId: String,
    @SerializedName("timeSlot") val timeSlot: String,
    @SerializedName("callType") val callType: String,
    @SerializedName("contactId") val contactId: String,
    @SerializedName("inmateId") val inmateId: String
)

data class SlotsResponse(
    @SerializedName("kioskId") val kioskId: String,
    @SerializedName("date") val date: String,
    @SerializedName("bookedSlots") val bookedSlots: List<BookedSlot>
)

data class ScheduleRequest(
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("kioskId") val kioskId: String,
    @SerializedName("contactId") val contactId: String,
    @SerializedName("date") val date: String,
    @SerializedName("timeSlot") val timeSlot: String,
    @SerializedName("callType") val callType: String
)
