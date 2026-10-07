package com.prisonconnect.kiosk.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.models.admin.CreateKioskAdminRequest
import com.prisonconnect.kiosk.models.admin.KioskAdmin
import com.prisonconnect.kiosk.models.admin.UpdateKioskAdminRequest
import com.prisonconnect.kiosk.models.common.ApiError
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException
import javax.inject.Inject

/**
 * Kiosk admin staff list for this prison - the same add / edit the warden panel
 * offers, scoped by the signed-in admin's own token.
 */
@HiltViewModel
class KioskAdminsViewModel @Inject constructor(
    private val apiService: TrustApiService
) : ViewModel() {

    data class UiState(
        val isLoading: Boolean = true,
        val admins: List<KioskAdmin> = emptyList(),
        val error: String? = null,
        val isSaving: Boolean = false,
        val saveError: String? = null,
        val message: String? = null
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        if (_state.value.admins.isEmpty()) _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val response = apiService.getKioskAdmins()
                val admins = response.data
                if (!response.success || admins == null) {
                    _state.update {
                        it.copy(isLoading = false, error = response.error?.message ?: "Could not load kiosk admins")
                    }
                    return@launch
                }
                _state.update { it.copy(isLoading = false, error = null, admins = admins) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = describe(e)) }
            }
        }
    }

    fun create(name: String, employeeId: String, email: String?, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(isSaving = true, saveError = null) }
            try {
                val response = apiService.createKioskAdmin(
                    CreateKioskAdminRequest(name = name, employeeId = employeeId, email = email, password = password)
                )
                if (!response.success || response.data == null) {
                    _state.update {
                        it.copy(isSaving = false, saveError = response.error?.message ?: "Could not add kiosk admin")
                    }
                    return@launch
                }
                _state.update { it.copy(isSaving = false, saveError = null, message = "Kiosk admin added") }
                load()
            } catch (e: Exception) {
                _state.update { it.copy(isSaving = false, saveError = describe(e)) }
            }
        }
    }

    fun update(adminId: String, name: String, employeeId: String, email: String?) {
        viewModelScope.launch {
            _state.update { it.copy(isSaving = true, saveError = null) }
            try {
                val response = apiService.updateKioskAdmin(
                    adminId = adminId,
                    // The backend only clears an email when it receives "" - a null
                    // would be rejected as an invalid address.
                    request = UpdateKioskAdminRequest(name = name, employeeId = employeeId, email = email ?: "")
                )
                if (!response.success || response.data == null) {
                    _state.update {
                        it.copy(isSaving = false, saveError = response.error?.message ?: "Could not save changes")
                    }
                    return@launch
                }
                _state.update { it.copy(isSaving = false, saveError = null, message = "Changes saved") }
                load()
            } catch (e: Exception) {
                _state.update { it.copy(isSaving = false, saveError = describe(e)) }
            }
        }
    }

    fun consumeMessage() {
        _state.update { it.copy(message = null) }
    }

    fun clearSaveError() {
        _state.update { it.copy(saveError = null) }
    }

    private fun describe(error: Throwable): String {
        if (error is HttpException) {
            val body = runCatching { error.response()?.errorBody()?.string() }.getOrNull()
            val envelope = runCatching {
                Gson().fromJson(body, ErrorEnvelope::class.java)
            }.getOrNull()
            return envelope?.error?.message ?: "Request failed (HTTP ${error.code()})"
        }
        return error.message ?: "Network error"
    }

    private data class ErrorEnvelope(val error: ApiError?)
}
