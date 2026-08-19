package com.prisonconnect.kiosk.repository

import com.prisonconnect.kiosk.models.call.*
import com.prisonconnect.kiosk.models.schedule.AvailableSlot
import com.prisonconnect.kiosk.models.schedule.ScheduleRequest
import com.prisonconnect.kiosk.network.NetworkResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

interface CallRepository {
    val socketStatus: StateFlow<SocketStatus>
    val roomStatus: StateFlow<RoomStatus>
    val signalingStatus: StateFlow<SignalingStatus>

    fun getScheduledCalls(id: String): Flow<NetworkResult<List<ScheduledCall>>>
    fun getCallHistory(id: String): Flow<NetworkResult<List<CallHistory>>>
    fun getAvailableSlots(contactId: String): Flow<NetworkResult<List<AvailableSlot>>>
    fun bookCall(request: ScheduleRequest): Flow<NetworkResult<ScheduledCall>>
    fun cancelBooking(bookingId: String): Flow<NetworkResult<Unit>>
    fun createRoom(inmateId: String, contactId: String, kioskId: String, callType: String): Flow<NetworkResult<CallSession>>
    fun checkSlotAvailability(contactId: String): Flow<NetworkResult<Boolean>>

    // Signaling
    fun initSignaling()
    fun joinRoom(roomId: String, peerId: String)
    fun leaveRoom(roomId: String, peerId: String)
    fun createWebRtcTransport(roomId: String, peerId: String, direction: String, callback: (Any) -> Unit)
    fun connectWebRtcTransport(peerId: String, direction: String, dtlsParameters: String)
    fun produce(peerId: String, kind: String, rtpParameters: String, callback: (Any) -> Unit)
    fun consume(peerId: String, producerId: String, rtpCapabilities: String, callback: (Any) -> Unit)
    fun resumeConsumer(peerId: String, consumerId: String)
    fun observeSignalingEvents(): Flow<SignalingEvent>
}
