package com.prisonconnect.kiosk.models.call

import com.google.gson.annotations.SerializedName

data class CallSession(
    @SerializedName("sessionId") val sessionId: String,
    @SerializedName("contactId") val contactId: String,
    @SerializedName("contactName") val contactName: String,
    @SerializedName("type") val type: CallType,
    @SerializedName("durationMinutes") val durationMinutes: Int,
    @SerializedName("startTime") val startTime: Long
)

enum class CallType {
    @SerializedName("audio") AUDIO,
    @SerializedName("video") VIDEO
}

data class ScheduledCall(
    @SerializedName("id") val id: String,
    @SerializedName("contactName") val contactName: String,
    @SerializedName("date") val date: String,
    @SerializedName("timeSlot") val timeSlot: String,
    @SerializedName("callType") val type: CallType?
)

enum class SocketStatus {
    CONNECTED,
    DISCONNECTED,
    CONNECTING,
    ERROR
}

enum class RoomStatus {
    IDLE,
    WAITING_FOR_FAMILY,
    READY,
    EXPIRED,
    TIMEOUT,
    JOINING,
    JOINED,
    ERROR
}

enum class SignalingStatus {
    IDLE,
    JOINING,
    JOINED,
    OFFER_SENT,
    OFFER_RECEIVED,
    ANSWER_SENT,
    ANSWER_RECEIVED,
    ICE_CANDIDATE_SENT,
    ICE_CANDIDATE_RECEIVED,
    CONNECTED,
    FAILED
}

data class SignalingEvent(
    val type: String,
    val data: Any
)
