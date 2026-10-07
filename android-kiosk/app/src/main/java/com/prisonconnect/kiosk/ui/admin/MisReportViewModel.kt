package com.prisonconnect.kiosk.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.core.MisReportFormatter
import com.prisonconnect.kiosk.core.SessionManager
import com.prisonconnect.kiosk.models.common.ApiError
import com.prisonconnect.kiosk.models.report.CallsMisReport
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.TimeZone
import javax.inject.Inject

/**
 * Loads the kiosk-scoped calls MIS report and turns it into printable receipt
 * text. The period is picked on this device; the backend cuts the day
 * boundaries with the offset sent alongside the dates.
 */
@HiltViewModel
class MisReportViewModel @Inject constructor(
    private val apiService: TrustApiService,
    private val sessionManager: SessionManager
) : ViewModel() {

    enum class Preset { TODAY, YESTERDAY, THIS_WEEK, THIS_MONTH, CUSTOM }

    data class UiState(
        val preset: Preset = Preset.THIS_WEEK,
        val from: LocalDate = LocalDate.now(),
        val to: LocalDate = LocalDate.now(),
        val isLoading: Boolean = false,
        val error: String? = null,
        val report: CallsMisReport? = null,
        val reportText: String? = null
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val isoDay: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.ENGLISH)

    init {
        applyPreset(Preset.THIS_WEEK)
        generate()
    }

    fun applyPreset(preset: Preset) {
        if (preset == Preset.CUSTOM) {
            _state.update { it.copy(preset = Preset.CUSTOM) }
            return
        }
        val today = LocalDate.now()
        val (from, to) = when (preset) {
            Preset.TODAY -> today to today
            Preset.YESTERDAY -> today.minusDays(1) to today.minusDays(1)
            Preset.THIS_WEEK -> today.with(java.time.DayOfWeek.MONDAY) to today
            Preset.THIS_MONTH -> today.withDayOfMonth(1) to today
            Preset.CUSTOM -> today to today
        }
        _state.update { it.copy(preset = preset, from = from, to = to) }
    }

    /** [millis] comes from the platform date picker, which is UTC-based. */
    fun setFrom(millis: Long) {
        val selected = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
        _state.update { current ->
            val to = if (selected > current.to) selected else current.to
            current.copy(preset = Preset.CUSTOM, from = selected, to = to)
        }
    }

    fun setTo(millis: Long) {
        val selected = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
        _state.update { current ->
            val from = if (selected < current.from) selected else current.from
            current.copy(preset = Preset.CUSTOM, from = from, to = selected)
        }
    }

    fun generate() {
        val current = _state.value
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            val fromText = current.from.format(isoDay)
            val toText = current.to.format(isoDay)
            val tzOffsetMinutes = TimeZone.getDefault().rawOffset / 60000
            try {
                val response = apiService.getCallsMisReport(fromText, toText, tzOffsetMinutes)
                val report: CallsMisReport? = response.data
                if (!response.success || report == null) {
                    _state.update {
                        it.copy(
                            isLoading = false,
                            error = response.error?.message ?: "Could not load the report"
                        )
                    }
                    return@launch
                }
                val preparedBy = sessionManager.getAdminProfile()?.employeeId ?: ""
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = null,
                        report = report,
                        reportText = MisReportFormatter.build(report, preparedBy)
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(isLoading = false, error = describe(e))
                }
            }
        }
    }

    private fun describe(error: Throwable): String {
        if (error is HttpException) {
            val body = runCatching { error.response()?.errorBody()?.string() }.getOrNull()
            val envelope = runCatching {
                Gson().fromJson(body, ErrorEnvelope::class.java)
            }.getOrNull()
            return envelope?.error?.message ?: "Request failed (HTTP ${error.code()})"
        }
        return error.message ?: "Could not load the report"
    }

    private data class ErrorEnvelope(val error: ApiError?)
}
