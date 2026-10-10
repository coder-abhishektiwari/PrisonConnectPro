package com.prisonconnect.kiosk.ui.call

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.schedule.BookedSlot
import com.prisonconnect.kiosk.models.schedule.ScheduleRequest
import com.prisonconnect.kiosk.models.schedule.SlotsResponse
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.CallRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@HiltViewModel
class ScheduleViewModel @Inject constructor(
    private val repository: CallRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _slotsState = MutableStateFlow<UiState<SlotsResponse>>(UiState.Idle)
    val slotsState = _slotsState.asStateFlow()

    private val _scheduleState = MutableStateFlow<UiState<Unit>>(UiState.Idle)
    val scheduleState = _scheduleState.asStateFlow()

    /** Server-issued id of the verified kiosk — null until /kiosks/verify succeeds. */
    private val kioskId: String?
        get() = authRepository.getVerifiedKiosk()?.kioskId?.takeIf { it.isNotBlank() }

    fun loadBookedSlots(date: String) {
        val kioskId = kioskId
        if (kioskId == null) {
            _slotsState.value = UiState.Error("Kiosk device is not verified. Please contact administration.")
            return
        }
        _slotsState.value = UiState.Loading
        viewModelScope.launch {
            repository.getBookedSlots(kioskId, date).collect { result ->
                when (result) {
                    is NetworkResult.Loading -> _slotsState.value = UiState.Loading
                    is NetworkResult.Success -> _slotsState.value = UiState.Success(result.data)
                    is NetworkResult.Failure -> _slotsState.value = UiState.Error(result.error.message ?: "Failed to load slots")
                    is NetworkResult.Idle -> _slotsState.value = UiState.Idle
                }
            }
        }
    }

    fun scheduleCall(contactId: String, date: String, timeSlot: String, callType: String) {
        viewModelScope.launch {
            // Hard-fail before booking: getInmateId suspends (DataStore read),
            // so the guard must live inside the coroutine.
            val kioskId = kioskId
            val inmateId = authRepository.getInmateId()
            if (kioskId == null || inmateId.isNullOrBlank()) {
                _scheduleState.value = UiState.Error("Kiosk not verified or session expired. Please login again.")
                return@launch
            }
            _scheduleState.value = UiState.Loading
            repository.bookCall(
                ScheduleRequest(
                    inmateId = inmateId,
                    kioskId = kioskId,
                    contactId = contactId,
                    date = date,
                    timeSlot = timeSlot,
                    callType = if (callType.equals("Audio", ignoreCase = true)) "audio" else "video"
                )
            ).collect { result ->
                when (result) {
                    is NetworkResult.Loading -> _scheduleState.value = UiState.Loading
                    is NetworkResult.Success -> _scheduleState.value = UiState.Success(Unit)
                    is NetworkResult.Failure -> _scheduleState.value = UiState.Error(result.error.message ?: "Failed to book call")
                    is NetworkResult.Idle -> _scheduleState.value = UiState.Idle
                }
            }
        }
    }

    fun resetState() {
        _scheduleState.value = UiState.Idle
    }
}
