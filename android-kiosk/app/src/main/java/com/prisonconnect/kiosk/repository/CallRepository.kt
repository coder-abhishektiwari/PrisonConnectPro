package com.prisonconnect.kiosk.repository

import com.prisonconnect.kiosk.models.call.*
import com.prisonconnect.kiosk.models.schedule.AvailableSlot
import com.prisonconnect.kiosk.models.schedule.ScheduleRequest
import com.prisonconnect.kiosk.network.NetworkResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject

interface CallRepository {
    val socketStatus: StateFlow<SocketStatus>
    val roomStatus: StateFlow<RoomStatus>
    val signalingStatus: StateFlow<SignalingStatus>

    fun getScheduledCalls(id: String): Flow<NetworkResult<List<ScheduledCall>>>
    fun getCallHistory(id: String): Flow<NetworkResult<List<CallHistory>>>
    fun getAvailableSlots(contactId: String): Flow<NetworkResult<List<AvailableSlot>>>
    fun bookCall(request: ScheduleRequest): Flow<NetworkResult<ScheduledCall>>
    fun cancelBooking(bookingId: String): Flow<NetworkResult<Unit>>
    fun createRoom(
        inmateId: String, contactId: String, kioskId: String, callType: String,
        callId: String? = null, roomId: String? = null, scheduleId: String? = null
    ): Flow<NetworkResult<CallSession>>
    fun checkSlotAvailability(contactId: String): Flow<NetworkResult<Boolean>>

    // Signaling (pure P2P WebRTC — Socket.IO only relays SDP + ICE)
    fun initSignaling()
    fun joinRoom(roomId: String, peerId: String)
    fun leaveRoom(roomId: String, peerId: String)
    fun sendOffer(sdp: JSONObject)
    fun sendAnswer(sdp: JSONObject)

    /** Notify the room that this peer hung up, so the other side ends too. */
    fun sendCallEnded()
    fun sendIceCandidate(candidate: JSONObject)
    fun getCallStatus(callId: String): Flow<NetworkResult<CallStatusSnapshot>>
    fun uploadRecording(request: RecordingUploadRequest): Flow<NetworkResult<RecordingUploadResponse>>

    /** Finalize the backend call record (duration/billing) once the call ends. */
    fun notifyCallEnded(callId: String)
    fun observeSignalingEvents(): Flow<SignalingEvent>
}
