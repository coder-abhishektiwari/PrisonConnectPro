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

    // No replay: a fresh collector (new call session) must NOT receive the
    // previous session's last event — a replayed "joined" used to trigger a
    // duplicate handleJoined and orphan transports.
    private val _signalingEvents = MutableSharedFlow<SignalingEvent>(extraBufferCapacity = 64)

    // Last join-room request, kept so a LATE socket connection can retry it.
    // If the signaling server/tunnel is slow, emitWithAck drops join-room
    // after its latch timeout — without this retry the call would hang even
    // after the connection finally comes up. lastJoinDropped ensures we only
    // retry an ACTUALLY-dropped join (never duplicate a live one).
    private var pendingJoin: Pair<String, String>? = null
    @Volatile private var lastJoinDropped = false
    // Set when the socket drops unexpectedly while a session is active. The
    // next EVENT_CONNECT then re-joins the room, because the signaling server
    // tracks room/transport state per socket instance.
    @Volatile private var needRejoin = false

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
                // Late connection or reconnect after an unexpected drop:
                // retry/re-join. A plain in-flight join is never duplicated.
                val pj = pendingJoin
                if (pj != null && (lastJoinDropped || needRejoin)) {
                    Logger.d("Socket (re)connected - ${if (needRejoin) "re" else ""}joining room")
                    lastJoinDropped = false
                    needRejoin = false
                    _roomStatus.value = RoomStatus.JOINING
                    emitJoin(pj.first, pj.second)
                }
            }
            Socket.EVENT_DISCONNECT -> {
                _socketStatus.value = SocketStatus.DISCONNECTED
                if (pendingJoin != null) {
                    // Session still active — the P2P connection survives short
                    // socket drops (media path is independent of signaling);
                    // re-join on reconnect so late SDP/ICE still relays.
                    needRejoin = true
                    _signalingStatus.value = SignalingStatus.IDLE
                } else {
                    _roomStatus.value = RoomStatus.IDLE
                    _signalingStatus.value = SignalingStatus.IDLE
                }
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
            "offer" -> {
                _signalingStatus.value = SignalingStatus.OFFER_RECEIVED
                _signalingEvents.emit(SignalingEvent("offer", data))
            }
            "answer" -> {
                _signalingStatus.value = SignalingStatus.ANSWER_RECEIVED
                _signalingEvents.emit(SignalingEvent("answer", data))
            }
            "ice-candidate" -> {
                _signalingEvents.emit(SignalingEvent("ice-candidate", data))
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
        socketService.connect()
        _roomStatus.value = RoomStatus.JOINING
        pendingJoin = roomId to peerId
        lastJoinDropped = false
        emitJoin(roomId, peerId)
    }

    private fun emitJoin(roomId: String, peerId: String) {
        val payload = JSONObject().apply {
            put("roomId", roomId)
            put("peerId", peerId)
        }
        // The signaling server returns the join result only via the ACK callback.
        socketService.emitWithAck("join-room", payload) { args ->
            val response = args.getOrNull(0)
            if (response == null) {
                // Dropped locally (socket never became ready within the latch
                // window). Keep pendingJoin so EVENT_CONNECT can retry it.
                lastJoinDropped = true
                Logger.w("join-room dropped before connect - will retry on connect")
            } else {
                val data = response as? JSONObject
                if (data?.optBoolean("success", false) == true) {
                    _roomStatus.value = RoomStatus.JOINED
                    _signalingStatus.value = SignalingStatus.JOINED
                    lastJoinDropped = false
                    needRejoin = false
                    // pendingJoin is intentionally RETAINED so an unexpected
                    // disconnect can re-join on reconnect; cleared in leaveRoom().
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
        pendingJoin = null
        lastJoinDropped = false
        needRejoin = false
    }

    override fun sendOffer(sdp: JSONObject) {
        socketService.emit("offer", sdp)
        _signalingStatus.value = SignalingStatus.OFFER_SENT
    }

    override fun sendAnswer(sdp: JSONObject) {
        socketService.emit("answer", sdp)
        _signalingStatus.value = SignalingStatus.ANSWER_SENT
    }

    override fun sendCallEnded() {
        socketService.emit("call-ended", JSONObject().put("reason", "hangup"))
    }

    override fun sendIceCandidate(candidate: JSONObject) {
        socketService.emit("ice-candidate", candidate)
    }

    override fun observeSignalingEvents(): Flow<SignalingEvent> = _signalingEvents.asSharedFlow()

    override fun getCallStatus(callId: String): Flow<NetworkResult<CallStatusSnapshot>> = flow {
        try {
            val response = apiService.getCallStatus(callId)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("NOT_FOUND", "Call not found")))
            }
        } catch (e: Exception) {
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Network exception")))
        }
    }.flowOn(Dispatchers.IO)

    override fun uploadRecording(request: RecordingUploadRequest): Flow<NetworkResult<RecordingUploadResponse>> = flow {
        try {
            val response = apiService.uploadRecording(request)
            if (response.success && response.data != null) {
                emit(NetworkResult.Success(response.data))
            } else {
                emit(NetworkResult.Failure(response.error ?: ApiError("UPLOAD_FAILED", "Recording upload failed")))
            }
        } catch (e: Exception) {
            Logger.e("Recording upload exception", e)
            emit(NetworkResult.Failure(ApiError("EXCEPTION", e.message ?: "Upload network exception")))
        }
    }.flowOn(Dispatchers.IO)

    override fun notifyCallEnded(callId: String) {
        // Fire-and-forget: finalizes duration/billing on the backend. Failure
        // (e.g. transient network) is non-fatal — the call has already ended.
        repositoryScope.launch {
            try {
                apiService.endCall(callId)
                Logger.d("Call record finalized for $callId")
            } catch (e: Exception) {
                Logger.w("Failed to finalize call $callId: ${e.message}")
            }
        }
    }

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

    override fun getCallHistory(id: String): Flow<NetworkResult<List<CallHistory>>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = apiService.getCallHistory(id)
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

    override fun createRoom(
        inmateId: String, contactId: String, kioskId: String, callType: String,
        callId: String?, roomId: String?
    ): Flow<NetworkResult<CallSession>> = flow {
        emit(NetworkResult.Loading)
        try {
            val response = apiService.createCall(
                CreateCallRequest(
                    inmateId = inmateId,
                    contactId = contactId,
                    kioskId = kioskId,
                    type = if (callType.equals("Audio", ignoreCase = true)) "audio" else "video",
                    callId = callId,
                    roomId = roomId
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
