package com.prisonconnect.kiosk.ui.admin

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.core.LocalRecordings
import com.prisonconnect.kiosk.models.call.CallHistory
import com.prisonconnect.kiosk.models.call.CallType
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

/**
 * Call History for the kiosk admin: the backend's kiosk-scoped call list
 * merged with the local recording vault. Recordings never leave the device,
 * so "has recording" is answered by scanning the local vault, and playback
 * happens entirely on this kiosk.
 */
@HiltViewModel
class CallHistoryViewModel @Inject constructor(
    private val apiService: TrustApiService,
    @ApplicationContext private val context: Context
) : ViewModel() {

    enum class TypeFilter(val label: String, val query: String?) {
        ALL("All", null),
        VIDEO("Video", "video"),
        AUDIO("Audio", "audio")
    }

    enum class DatePreset(val label: String) {
        ALL("All time"),
        TODAY("Today"),
        THIS_WEEK("This week"),
        THIS_MONTH("This month")
    }

    data class Playback(
        val callId: String,
        val title: String,
        /** Plain playable copy; null while the vault is still decrypting. */
        val file: File?,
        val isTemporary: Boolean,
        val isAudio: Boolean,
        /** True while the decrypt runs in the background. */
        val decrypting: Boolean
    )

    data class UiState(
        val search: String = "",
        val typeFilter: TypeFilter = TypeFilter.ALL,
        val datePreset: DatePreset = DatePreset.ALL,
        val recordedOnly: Boolean = false,
        val isLoading: Boolean = false,
        val error: String? = null,
        val calls: List<CallHistory> = emptyList(),
        val total: Int = 0,
        val localCallIds: Set<String> = emptySet(),
        val playback: Playback? = null,
        val playbackError: String? = null,
        val isPreparingPlayback: Boolean = false,
        val preparingCallId: String? = null,
        /** Vault-decrypt progress for the preparing playback, 0f..1f. */
        val playbackProgress: Float = 0f
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var searchJob: Job? = null
    private val isoDay: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.ENGLISH)

    init {
        load()
    }

    fun onSearchChange(query: String) {
        _state.update { it.copy(search = query) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(400)
            load()
        }
    }

    fun setTypeFilter(filter: TypeFilter) {
        _state.update { it.copy(typeFilter = filter) }
        load()
    }

    fun setDatePreset(preset: DatePreset) {
        _state.update { it.copy(datePreset = preset) }
        load()
    }

    fun toggleRecordedOnly() {
        _state.update { it.copy(recordedOnly = !it.recordedOnly) }
        load()
    }

    fun retry() = load()

    fun startPlayback(call: CallHistory) {
        // The player opens FIRST and the vault decrypts behind it (YouTube
        // style) — the seek bar's gray line reports real percentage. Never
        // run two decrypts at once, though.
        val snapshot = _state.value
        val callId = call.callId
        val title = listOfNotNull(
            call.inmateName ?: "Inmate",
            call.contactName ?: "Family"
        ).joinToString("  →  ")
        val isAudio = call.type == CallType.AUDIO
        if (snapshot.playback != null) return
        if (snapshot.isPreparingPlayback) {
            // Same call already decrypting in the background — just bring
            // the player back; the running job keeps feeding progress.
            if (snapshot.preparingCallId == callId) {
                _state.update {
                    it.copy(
                        playback = Playback(
                            callId = callId,
                            title = title,
                            file = null,
                            isTemporary = false,
                            isAudio = isAudio,
                            decrypting = true
                        )
                    )
                }
            }
            return
        }
        viewModelScope.launch {
            _state.update {
                it.copy(
                    playbackError = null,
                    isPreparingPlayback = true,
                    preparingCallId = callId,
                    playbackProgress = 0f,
                    playback = Playback(
                        callId = callId,
                        title = title,
                        file = null,
                        isTemporary = false,
                        isAudio = isAudio,
                        decrypting = true
                    )
                )
            }
            try {
                // Real decrypt percentage, chunk by chunk — drives the gray
                // buffer line on the player's seek bar and the card bar
                // (visible if the dialog gets dismissed mid-decrypt).
                val emit: (Long, Long) -> Unit = { done, total ->
                    val fraction = if (total > 0) done.toFloat() / total else 0f
                    _state.update { s -> s.copy(playbackProgress = fraction.coerceIn(0f, 1f)) }
                }
                val materialized: File? = withContext(Dispatchers.IO) {
                    val file = LocalRecordings.materializeForPlay(context, callId, emit)
                    // A master written under its roomId (the recorder's id)
                    // is still playable when the list row carries both ids.
                    if (file == null && call.roomId != null) {
                        LocalRecordings.materializeForPlay(context, call.roomId, emit)
                    } else file
                }
                if (materialized == null) {
                    _state.update { s ->
                        val pb = s.playback
                        s.copy(
                            playbackError = "No recording stored on this kiosk for that call",
                            playback = if (pb != null && pb.callId == callId) null else pb
                        )
                    }
                } else {
                    val isTemp = materialized.name.startsWith("play-")
                    _state.update { s ->
                        val pb = s.playback
                        if (pb != null && pb.callId == callId) {
                            s.copy(
                                playback = pb.copy(
                                    file = materialized,
                                    isTemporary = isTemp,
                                    decrypting = false
                                ),
                                playbackProgress = 1f
                            )
                        } else s.copy(playbackProgress = 1f)
                    }
                    // Dismissed mid-decrypt → nobody is waiting for this copy.
                    if (_state.value.playback == null && isTemp) {
                        withContext(Dispatchers.IO) { runCatching { materialized.delete() } }
                    }
                }
            } catch (t: Throwable) {
                _state.update { s ->
                    val pb = s.playback
                    s.copy(
                        playbackError = "Could not open the recording: ${t.message}",
                        playback = if (pb != null && pb.callId == callId && pb.decrypting) null else pb
                    )
                }
            } finally {
                _state.update { it.copy(isPreparingPlayback = false, preparingCallId = null) }
            }
        }
    }

    fun dismissPlayback() {
        val current = _state.value.playback ?: return
        _state.update { it.copy(playback = null) }
        if (current.isTemporary) {
            val temp = current.file
            viewModelScope.launch(Dispatchers.IO) {
                runCatching { temp?.delete() }
            }
        }
    }

    fun clearPlaybackError() {
        _state.update { it.copy(playbackError = null) }
    }

    private fun load() {
        val snapshot = _state.value
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            try {
                val (from, to) = rangeFor(snapshot.datePreset)
                val response = apiService.getCallHistoryPage(
                    search = snapshot.search.trim().takeIf { it.isNotBlank() },
                    type = snapshot.typeFilter.query,
                    dateFrom = from,
                    dateTo = to,
                    limit = 100
                )
                val page = response.data
                if (!response.success || page == null) {
                    _state.update {
                        it.copy(
                            isLoading = false,
                            error = response.error?.message ?: "Could not load call history"
                        )
                    }
                    return@launch
                }
                val localIds = withContext(Dispatchers.IO) { LocalRecordings.callIds(context) }
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = null,
                        calls = page.calls,
                        total = page.total,
                        localCallIds = localIds
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(isLoading = false, error = e.message ?: "Could not load call history")
                }
            }
        }
    }

    /** Backend dateFrom/dateTo are inclusive `yyyy-MM-dd` day boundaries. */
    private fun rangeFor(preset: DatePreset): Pair<String?, String?> {
        val today = LocalDate.now()
        return when (preset) {
            DatePreset.ALL -> null to null
            DatePreset.TODAY -> today.format(isoDay) to today.format(isoDay)
            DatePreset.THIS_WEEK -> today.with(DayOfWeek.MONDAY).format(isoDay) to today.format(isoDay)
            DatePreset.THIS_MONTH -> today.withDayOfMonth(1).format(isoDay) to today.format(isoDay)
        }
    }
}
