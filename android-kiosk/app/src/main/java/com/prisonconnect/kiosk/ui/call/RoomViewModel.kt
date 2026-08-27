package com.prisonconnect.kiosk.ui.call

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.config.AppConfig
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.call.CallSession
import com.prisonconnect.kiosk.models.call.RoomStatus
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.CallRepository
import com.prisonconnect.kiosk.repository.InmateRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class RoomViewModel @Inject constructor(
    private val callRepository: CallRepository,
    private val inmateRepository: InmateRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _createRoomState = MutableStateFlow<UiState<CallSession>>(UiState.Idle)
    val createRoomState: StateFlow<UiState<CallSession>> = _createRoomState.asStateFlow()

    private val _roomStatus = MutableStateFlow(RoomStatus.IDLE)
    val roomStatus: StateFlow<RoomStatus> = _roomStatus.asStateFlow()

    val signalingRoomStatus = callRepository.roomStatus
    val socketStatus = callRepository.socketStatus

    private val _remainingTime = MutableStateFlow(0L)
    val remainingTime: StateFlow<Long> = _remainingTime.asStateFlow()

    private val _cancelState = MutableStateFlow<UiState<Unit>>(UiState.Idle)
    val cancelState = _cancelState.asStateFlow()

    private val _isSlotAvailable = MutableStateFlow(true)
    val isSlotAvailable: StateFlow<Boolean> = _isSlotAvailable.asStateFlow()

    private val _balance = MutableStateFlow(0.0)
    val balance = _balance.asStateFlow()

    private val _maxDurationMinutes = MutableStateFlow(15)
    val maxDurationMinutes: StateFlow<Int> = _maxDurationMinutes.asStateFlow()

    fun startLobbyTimer(startTimeMillis: Long) {
        viewModelScope.launch {
            while (true) {
                val currentTime = System.currentTimeMillis()
                val diff = startTimeMillis - currentTime
                if (diff <= 0) {
                    _remainingTime.value = 0
                    _roomStatus.value = RoomStatus.READY
                    break
                }
                _remainingTime.value = diff
                _roomStatus.value = RoomStatus.WAITING_FOR_FAMILY
                delay(1000)
            }
        }
    }

    fun setReadyNow() {
        _remainingTime.value = 0
        _roomStatus.value = RoomStatus.READY
    }

    fun cancelBooking(bookingId: String) {
        _cancelState.value = UiState.Loading
        viewModelScope.launch {
            callRepository.cancelBooking(bookingId).collect { result ->
                when (result) {
                    is NetworkResult.Success -> _cancelState.value = UiState.Success(Unit)
                    is NetworkResult.Failure -> _cancelState.value = UiState.Error(result.error.message ?: "Failed to cancel")
                    else -> {}
                }
            }
        }
    }

    fun checkSlot(contactId: String) {
        viewModelScope.launch {
            callRepository.checkSlotAvailability(contactId).collect { result ->
                if (result is NetworkResult.Success) {
                    _isSlotAvailable.value = result.data
                }
            }
        }
    }

    fun loadBalance() {
        viewModelScope.launch {
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            inmateRepository.getBalance(inmateId).collect { result ->
                if (result is NetworkResult.Success) {
                    _balance.value = result.data.credits
                }
            }
        }
    }

    fun loadMaxDuration() {
        viewModelScope.launch {
            try {
                val response = callRepository.getSettings()
                if (response is NetworkResult.Success) {
                    val settings = response.data
                    val maxDur = settings?.get("callSettings")?.asJsonObject
                        ?.get("maxCallDurationMinutes")?.asInt ?: 15
                    _maxDurationMinutes.value = maxDur
                }
            } catch (_: Exception) {}
        }
    }

    /**
     * One-shot navigation consume. The lobby auto-navigates into the call
     * screen when createRoomState is Success. Without consuming the state,
     * every recomposition of the lobby (e.g. popping back from a failed call)
     * re-fires the navigation and hurls the user straight back into another
     * failing call — an infinite fail/restart loop.
     */
    fun consumeCreateRoomNavigation() {
        _createRoomState.value = UiState.Idle
    }

    fun createRoom(contactId: String, callType: String, scheduleId: String? = null) {
        _createRoomState.value = UiState.Loading
        // Drop any stale runtime signaling URL/token from a previous call; a
        // fresh one arrives with the background POST below.
        AppConfig.signalingUrlOverride = null
        AppConfig.signalingToken = null

        // OPTIMISTIC NAVIGATION: mint both ids client-side — the backend
        // accepts caller-supplied callId/roomId — so the UI moves to the
        // progress screen INSTANTLY while POST /calls runs in the background.
        val callId = "CALL-" + java.util.UUID.randomUUID().toString().replace("-", "").take(8).uppercase()
        val roomId = "ROOM-" + java.util.UUID.randomUUID().toString().replace("-", "").take(8).uppercase()
        AppConfigBridge.lastCallId = callId

        _createRoomState.value = UiState.Success(
            CallSession(sessionId = roomId, callId = callId, contactId = contactId)
        )

        viewModelScope.launch {
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            val kioskId = authRepository.getVerifiedKiosk()?.kioskId ?: Constants.KIOSK_ID
            callRepository.createRoom(inmateId, contactId, kioskId, callType, callId, roomId, scheduleId).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        // The signaling socket needs this backend-minted token;
                        // WebRtcManager waits for it before joining the room.
                        AppConfig.signalingToken = result.data.signalingToken
                        // Prefer the backend-provided public signaling URL so the APK
                        // keeps working even when the deployment's tunnel URL changes.
                        result.data.signalingUrl?.takeIf { it.isNotBlank() }?.let {
                            AppConfig.signalingUrlOverride = it
                            Logger.d("Using backend-provided signaling URL")
                        }
                        Logger.d("Background call creation complete: ${result.data.callId}")
                    }
                    is NetworkResult.Failure -> {
                        // Nothing to do here — the progress screen's status poll
                        // 404s until timeout and surfaces "Call Failed" on its own.
                        Logger.e("Background call creation failed: ${result.error.message}")
                    }
                    else -> {}
                }
            }
        }
    }
}
