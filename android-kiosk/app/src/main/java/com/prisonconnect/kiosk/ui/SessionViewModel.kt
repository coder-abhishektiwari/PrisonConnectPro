package com.prisonconnect.kiosk.ui

import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

/**
 * SessionViewModel - Restores the persistent session on app startup.
 *
 * Checks if a valid session exists in DataStore and either:
 *  - Restores the session (navigate to dashboard)
 *  - Attempts a silent token refresh (if expired)
 *  - Clears the session and navigates to login
 */
@HiltViewModel
class SessionViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : BaseViewModel() {

    sealed interface SessionState {
        data object Checking : SessionState
        data object Restored : SessionState
        data object NoSession : SessionState
        data class Error(val message: String) : SessionState
    }

    private val _sessionState = MutableStateFlow<SessionState>(SessionState.Checking)
    val sessionState = _sessionState.asStateFlow()

    private val _navigationEvent = MutableSharedFlow<SessionNavigation>()
    val navigationEvent = _navigationEvent.asSharedFlow()

    init {
        restoreSession()
    }

    /**
     * Attempt to restore the persistent session.
     */
    fun restoreSession() {
        launch {
            _sessionState.value = SessionState.Checking

            // Check if a session exists at all
            if (!authRepository.hasSession()) {
                _sessionState.value = SessionState.NoSession
                _navigationEvent.emit(SessionNavigation.NavigateToLogin)
                return@launch
            }

            // Check if the session is still valid
            if (authRepository.hasValidSession()) {
                Logger.i("SessionViewModel: Valid session restored")
                _sessionState.value = SessionState.Restored
                _navigationEvent.emit(SessionNavigation.NavigateToDashboard)
                return@launch
            }

            // Session exists but token is expired - try to refresh silently
            Logger.i("SessionViewModel: Token expired, attempting silent refresh")
            authRepository.refreshToken().collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        Logger.i("SessionViewModel: Token refreshed successfully")
                        _sessionState.value = SessionState.Restored
                        _navigationEvent.emit(SessionNavigation.NavigateToDashboard)
                    }
                    is NetworkResult.Failure -> {
                        Logger.w("SessionViewModel: Token refresh failed: ${result.error.message}")
                        // Clear the invalid session
                        authRepository.logout().collect { }
                        _sessionState.value = SessionState.NoSession
                        _navigationEvent.emit(SessionNavigation.NavigateToLogin)
                    }
                    else -> {}
                }
            }
        }
    }

    sealed class SessionNavigation {
        data object NavigateToLogin : SessionNavigation()
        data object NavigateToDashboard : SessionNavigation()
    }
}