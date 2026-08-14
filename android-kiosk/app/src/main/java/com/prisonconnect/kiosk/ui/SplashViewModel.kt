package com.prisonconnect.kiosk.ui

import com.prisonconnect.kiosk.config.AppConfig
import com.prisonconnect.kiosk.config.Environment
import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.hardware.DeviceInfoProvider
import com.prisonconnect.kiosk.models.auth.KioskVerifyRequest
import com.prisonconnect.kiosk.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

import com.prisonconnect.kiosk.core.SessionManager

@HiltViewModel
class SplashViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val deviceInfoProvider: DeviceInfoProvider,
    private val sessionManager: SessionManager
) : BaseViewModel() {

    sealed interface KioskVerificationState {
        data object CheckingDevice : KioskVerificationState
        data object Authorized : KioskVerificationState
        data object Unauthorized : KioskVerificationState
        data class VerificationError(val message: String, val isTransient: Boolean) : KioskVerificationState
    }

    private val _verificationState = MutableStateFlow<KioskVerificationState>(KioskVerificationState.CheckingDevice)
    val verificationState = _verificationState.asStateFlow()

    private val _navigationEvent = MutableSharedFlow<SplashNavigation>()
    val navigationEvent = _navigationEvent.asSharedFlow()

    init {
        startVerification()
    }

    fun startVerification() {
        launch {
            verifyKiosk()
        }
    }

    private suspend fun verifyKiosk() {
        _verificationState.value = KioskVerificationState.CheckingDevice
        delay(1000)

        // If Device Authorization is disabled in AppConfig, bypass registration/authorization flow
        if (!AppConfig.deviceAuthorizationEnabled) {
            Logger.i("SplashViewModel: Device Authorization DISABLED in AppConfig. Bypassing gate.")
            checkSessionAndNavigate()
            return
        }

        // Check persistent registration status
        val registrationStatus = sessionManager.getRegistrationStatus()
        Logger.d("SplashViewModel: Registration Status = $registrationStatus")

        if (registrationStatus != "approved") {
            Logger.i("SplashViewModel: Kiosk not approved yet (Status: $registrationStatus). Navigating to Registration.")
            _navigationEvent.emit(SplashNavigation.NavigateToRegistration)
            return
        }

        val deviceSerial = deviceInfoProvider.getDeviceSerialNumber()
        Logger.d("SplashViewModel: Strict Serial Verification: $deviceSerial")

        if (deviceSerial.isNullOrBlank()) {
            Logger.e("SplashViewModel: Device Serial UNAVAILABLE.")
            _verificationState.value = KioskVerificationState.Unauthorized
            _navigationEvent.emit(SplashNavigation.NavigateToUnauthorized)
            return
        }

        val request = KioskVerifyRequest(deviceSerialNumber = deviceSerial.trim())
        authRepository.verifyKiosk(request).collect { response ->
            when (response) {
                is NetworkResult.Loading -> {
                    _verificationState.value = KioskVerificationState.CheckingDevice
                }
                is NetworkResult.Success -> {
                    if (response.data.authorized && response.data.kiosk != null) {
                        _verificationState.value = KioskVerificationState.Authorized
                        checkSessionAndNavigate()
                    } else {
                        _verificationState.value = KioskVerificationState.Unauthorized
                        _navigationEvent.emit(SplashNavigation.NavigateToUnauthorized)
                    }
                }
                is NetworkResult.Failure -> {
                    val errMsg = response.error.message ?: "Failed to reach the validation server."
                    _verificationState.value = KioskVerificationState.VerificationError(
                        message = "Verification failed: $errMsg",
                        isTransient = true
                    )
                }
                is NetworkResult.Idle -> { /* no-op */ }
            }
        }
    }

    private suspend fun checkSessionAndNavigate() {
        if (authRepository.hasValidSession()) {
            Logger.i("SplashViewModel: Valid session found, navigating to dashboard")
            _navigationEvent.emit(SplashNavigation.NavigateToDashboard)
        } else if (authRepository.hasSession()) {
            Logger.i("SplashViewModel: Session expired, attempting silent refresh")
            authRepository.refreshToken().collect { refreshResult ->
                when (refreshResult) {
                    is NetworkResult.Success -> {
                        Logger.i("SplashViewModel: Token refreshed, navigating to dashboard")
                        _navigationEvent.emit(SplashNavigation.NavigateToDashboard)
                    }
                    is NetworkResult.Failure -> {
                        Logger.w("SplashViewModel: Refresh failed, navigating to login")
                        authRepository.logout().collect { }
                        _navigationEvent.emit(SplashNavigation.NavigateToLogin)
                    }
                    else -> {}
                }
            }
        } else {
            Logger.i("SplashViewModel: No session, navigating to login")
            _navigationEvent.emit(SplashNavigation.NavigateToLogin)
        }
    }

    sealed class SplashNavigation {
        data object NavigateToRegistration : SplashNavigation()
        data object NavigateToLogin : SplashNavigation()
        data object NavigateToUnauthorized : SplashNavigation()
        data object NavigateToDashboard : SplashNavigation()
    }
}