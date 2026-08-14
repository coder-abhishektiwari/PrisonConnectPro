package com.prisonconnect.kiosk.ui.call

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.Constants
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

    fun checkSlot(contactName: String) {
        viewModelScope.launch {
            callRepository.checkSlotAvailability(contactName).collect { result ->
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

    fun createRoom(contactId: String, callType: String) {
        _createRoomState.value = UiState.Loading
        viewModelScope.launch {
            callRepository.createRoom(contactId, callType).collect { result ->
                when (result) {
                    is NetworkResult.Loading -> _createRoomState.value = UiState.Loading
                    is NetworkResult.Success -> {
                        _createRoomState.value = UiState.Success(result.data)
                        callRepository.joinRoom(result.data.sessionId, "kiosk-${System.currentTimeMillis()}")
                        Logger.d("Room setup complete: ${result.data.sessionId}")
                    }
                    is NetworkResult.Failure -> {
                        _createRoomState.value = UiState.Error(result.error.message ?: "Failed to setup room")
                    }
                    is NetworkResult.Idle -> _createRoomState.value = UiState.Idle
                }
            }
        }
    }
}
