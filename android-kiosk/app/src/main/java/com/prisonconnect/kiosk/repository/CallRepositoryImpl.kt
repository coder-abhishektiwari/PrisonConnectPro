package com.prisonconnect.kiosk.repository

import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.config.AppConfig
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.models.call.*
import com.prisonconnect.kiosk.models.common.ApiError
import com.prisonconnect.kiosk.models.schedule.AvailableSlot
import com.prisonconnect.kiosk.models.schedule.ScheduleRequest
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.socket.SocketService
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CallRepositoryImpl @Inject constructor(
    private val apiService: TrustApiService,
    private val socketService: SocketService
) : CallRepository {

    private val repositoryScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _socketStatus = MutableStateFlow(SocketStatus.DISCONNECTED)
    override val socketStatus = _socketStatus.asStateFlow()

    private val _roomStatus = MutableStateFlow(RoomStatus.IDLE)
    override val roomStatus = _roomStatus.asStateFlow()

    private val _signalingStatus = MutableStateFlow(SignalingStatus.IDLE)
    override val signalingStatus = _signalingStatus.asStateFlow()

    private val _signalingEvents = MutableSharedFlow<SignalingEvent>(extraBufferCapacity = 64)

    init {
        observeSocketEvents()
    }

    private fun observeSocketEvents() {
        repositoryScope.launch {
            socketService.observeEvents().collect { (event, data) ->
                handleSocketEvent(event, data)
            }
        }
    }

    private suspend fun handleSocketEvent(event: String, data: Any) {
        when (event) {
            Socket.EVENT_CONNECT -> {
                _socketStatus.value = SocketStatus.CONNECTED
            }
            Socket.EVENT_DISCONNECT -> {
                _socketStatus.value = SocketStatus.DISCONNECTED
                _roomStatus.value = RoomStatus.IDLE
                _signalingStatus.value = SignalingStatus.IDLE
            }
            Socket.EVENT_CONNECT_ERROR -> {
                _socketStatus.value = SocketStatus.ERROR
            }
            "joined" -> {
                _roomStatus.value = RoomStatus.JOINED
                _signalingStatus.value = SignalingStatus.JOINED
                _signalingEvents.emit(SignalingEvent("joined", data))
            }
            "peer-joined" -> {
                _signalingEvents.emit(SignalingEvent("peer-joined", data))
            }
            "peer-left" -> {
                _signalingEvents.emit(SignalingEvent("peer-left", data))
            }
            "new-producer" -> {
                _signalingEvents.emit(SignalingEvent("new-producer", data))
            }
            "call-ended" -> {
                _signalingStatus.value = SignalingStatus.IDLE
                _roomStatus.value = RoomStatus.IDLE
                _signalingEvents.emit(SignalingEvent("call-ended", data))
            }
        }
    }

    override fun initSignaling() {
        socketService.connect()
    }

    override fun joinRoom(roomId: String, peerId: String) {
        if (!socketService.isConnected()) {
            socketService.connect()
        }
        _roomStatus.value = RoomStatus.JOINING
        val payload = JSONObject().apply {
            put("roomId", roomId)
            put("peerId", peerId)
        }
        // The signaling server returns the join result only via the ACK callback.
        socketService.emitWithAck("join-room", payload) { args ->
            val response = args.getOrNull(0)
            if (response != null) {
                val data = response as? JSONObject
                if (data?.optBoolean("success", false) == true) {
                    _roomStatus.value = RoomStatus.JOINED
                    _signalingStatus.value = SignalingStatus.JOINED
                }
                _signalingEvents.tryEmit(SignalingEvent("joined", response))
            }
        }
    }

    override fun leaveRoom(roomId: String, peerId: String) {
        val payload = JSONObject().apply {
            put("roomId", roomId)
            put("peerId", peerId)
        }
        socketService.emit("leave-room", payload)
        _roomStatus.value = RoomStatus.IDLE
        _signalingStatus.value = SignalingStatus.IDLE
        AppConfig.signalingToken = null
    }

    override fun createWebRtcTransport(roomId: String, peerId: String, direction: String, callback: (Any) -> Unit) {
        val payload = JSONObject().apply {
            put("roomId", roomId)
            put("peerId", peerId)
            put("direction", direction)
        }
        socketService.emitWithAck("createWebRtcTransport", payload) { args ->
            val response = args.getOrNull(0)
            if (response != null) {
                callback(response)
            }
        }
    }

    override fun connectWebRtcTransport(peerId: String, direction: String, dtlsParameters: String) {
        val payload = JSONObject().apply {
            put("peerId", peerId)
            put("direction", direction)
            put("dtlsParameters", JSONObject(dtlsParameters))
        }
        socketService.emit("connectWebRtcTransport", payload)
    }

    override fun produce(peerId: String, kind: String, rtpParameters: String, callback: (Any) -> Unit) {
        val payload = JSONObject().apply {
            put("peerId", peerId)
            put("kind", kind)
            put("rtpParameters", JSONObject(rtpParameters))
            put("appData", JSONObject())
        }
        socketService.emitWithAck("produce", payload) { args ->
            val response = args.getOrNull(0)
            if (response != null) {
                callback(response)
            }
        }
    }

    override fun consume(peerId: String, producerId: String, rtpCapabilities: String, callback: (Any) -> Unit) {
        val payload = JSONObject().apply {
            put("peerId", peerId)
            put("producerId", producerId)
            put("rtpCapabilities", JSONObject(rtpCapabilities))
        }
        socketService.emitWithAck("consume", payload) { args ->
            val response = args.getOrNull(0)
            if (response != null) {
                callback(response)
            }
        }
    }

    override fun resumeConsumer(peerId: String, consumerId: String) {
        val payload = JSONObject().apply {
            put("peerId", peerId)
            put("consumerId", consumerId)
        }
        socketService.emit("resumeConsumer", payload)
    }

    override fun observeSignalingEvents(): Flow<SignalingEvent> = _signalingEvents.asSharedFlow()

    override fun getScheduledCalls(id: String): Flow<NetworkResult<List<ScheduledCall>>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = apiService.getScheduledCalls(id)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun getAvailableSlots(contactId: String): Flow<NetworkResult<List<AvailableSlot>>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = apiService.getAvailableSlots(contactId)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun bookCall(request: ScheduleRequest): Flow<NetworkResult<ScheduledCall>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = apiService.bookCall(request)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun cancelBooking(bookingId: String): Flow<NetworkResult<Unit>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = apiService.cancelBooking(bookingId)
            if (response.success) {
                emit(NetworkResult.Success(Unit))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UNKNOWN", "Unknown error")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun createRoom(inmateId: String, contactId: String, kioskId: String, callType: String): Flow<NetworkResult<CallSession>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = apiService.createCall(
                CreateCallRequest(
                    inmateId = inmateId,
                    contactId = contactId,
                    kioskId = kioskId,
                    type = if (callType.equals("Audio", ignoreCase = true)) "audio" else "video"
                )
            )
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("ROOM_FAILED", "Failed to setup room")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }

    override fun checkSlotAvailability(contactId: String): Flow<NetworkResult<Boolean>> = flow {
        emit(NetworkResult.Loading)
        try {
            val slotsResponse = apiService.getAvailableSlots(contactId)
            if (slotsResponse.success && slotsResponse.data != null) {
                val available = slotsResponse.data.any { it.isAvailable }
                emit(NetworkResult.Success(available))
            } else {
                emit(NetworkResult.Failure(slotsResponse.error ?: ApiError("SLOT_FAILED", "Failed to check slot availability")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }
}
