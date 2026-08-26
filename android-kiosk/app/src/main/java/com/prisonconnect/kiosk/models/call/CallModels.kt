package com.prisonconnect.kiosk.models.call

import com.google.gson.annotations.SerializedName

data class CallSession(
    @SerializedName("roomId") val sessionId: String,
    @SerializedName("callId") val callId: String? = null,
    @SerializedName("contactId") val contactId: String = "",
    @SerializedName("contactName") val contactName: String? = null,
    @SerializedName("type") val type: CallType? = null,
    @SerializedName("durationMinutes") val durationMinutes: Int? = null,
    @SerializedName("startTime") val startTime: String? = null,
    @SerializedName("signalingToken") val signalingToken: String? = null,
    /** Public signaling URL delivered by the backend at runtime, so the APK
     *  never needs rebuilding when the deployment's signaling URL changes. */
    @SerializedName("signalingUrl") val signalingUrl: String? = null
)

data class CreateCallRequest(
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("contactId") val contactId: String,
    @SerializedName("kioskId") val kioskId: String,
    @SerializedName("type") val type: String = "video",
    /** Client-minted ids enable optimistic navigation: the backend accepts
     *  caller-supplied values, so the UI can move on before the POST lands. */
    @SerializedName("callId") val callId: String? = null,
    @SerializedName("roomId") val roomId: String? = null,
    /** Set when the call was launched from a dashboard scheduled-call card —
     *  the backend marks that booking completed so it leaves the list. */
    @SerializedName("scheduleId") val scheduleId: String? = null
)

enum class CallType {
    @SerializedName("audio") AUDIO,
    @SerializedName("video") VIDEO
}

data class ScheduledCall(
    @SerializedName("scheduleId") val id: String,
    @SerializedName("date") val date: String = "",
    @SerializedName("timeSlot") val timeSlot: String = "",
    @SerializedName("callType") val type: CallType? = null,
    @SerializedName("contactId") val contactId: String? = null,
    @SerializedName("status") val status: String? = null,
    @SerializedName("contactName") val contactName: String? = null
)

data class CallHistory(
    @SerializedName("callId") val callId: String,
    @SerializedName("type") val type: CallType? = null,
    @SerializedName("contactId") val contactId: String? = null,
    @SerializedName("contactName") val contactName: String? = null,
    @SerializedName("status") val status: String? = null,
    @SerializedName("startTime") val startTime: String? = null,
    @SerializedName("endTime") val endTime: String? = null,
    @SerializedName("durationMinutes") val durationMinutes: Int? = null,
    @SerializedName("duration") val duration: Int? = null
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

/** Kiosk-side recording upload payload (base64-encoded MP4). */
data class RecordingUploadRequest(
    @SerializedName("callId") val callId: String,
    @SerializedName("inmateId") val inmateId: String? = null,
    @SerializedName("contactId") val contactId: String? = null,
    @SerializedName("base64Data") val base64Data: String,
    @SerializedName("fileName") val fileName: String,
    @SerializedName("mimeType") val mimeType: String = "video/mp4"
)

data class RecordingUploadResponse(
    @SerializedName("recordingId") val recordingId: String? = null,
    @SerializedName("callId") val callId: String? = null,
    @SerializedName("fileName") val fileName: String? = null,
    @SerializedName("status") val status: String? = null
)

/** Slim snapshot of a call used by the kiosk progress screen. */
data class CallStatusSnapshot(
    @SerializedName("callId") val callId: String? = null,
    @SerializedName("status") val status: String? = null,
    @SerializedName("linkOpenedAt") val linkOpenedAt: String? = null,
    @SerializedName("ratePerMinute") val ratePerMinute: Double? = null,
    /** Warden-controlled max call length in minutes (from Settings). */
    @SerializedName("maxDurationMinutes") val maxDurationMinutes: Int? = null,
    @SerializedName("family") val family: FamilyProgress? = null
) {
    data class FamilyProgress(
        @SerializedName("deviceVerified") val deviceVerified: Boolean? = null,
        @SerializedName("otpVerified") val otpVerified: Boolean? = null,
        /** Failed verification attempts — the kiosk shows these steps in red. */
        @SerializedName("deviceFailedAttempts") val deviceFailedAttempts: Int? = null,
        @SerializedName("otpFailedAttempts") val otpFailedAttempts: Int? = null,
        /** Presence heartbeat from the family verification pages. If this goes
         *  stale mid-verification, the family member closed the screen. */
        @SerializedName("lastSeenAt") val lastSeenAt: String? = null
    )
}
