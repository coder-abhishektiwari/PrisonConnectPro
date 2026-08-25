package com.prisonconnect.kiosk.ui.auth

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.graphics.Bitmap
import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.hardware.FaceAuthProcessor
import com.prisonconnect.kiosk.hardware.FingerprintHardwareManager
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.models.auth.AdminVerifyPasswordRequest
import com.prisonconnect.kiosk.models.auth.LoginRequest
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import kotlin.time.Duration.Companion.milliseconds

enum class LoginStage {
    METHOD_SELECTION, FACE_SCANNING, FINGERPRINT_SCANNING, RFID_SCANNING, PRISONER_ID_ENTRY, PIN_ENTRY, ADMIN_USERNAME_ENTRY, ADMIN_PIN_ENTRY
}

@HiltViewModel
class LoginViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val authRepository: AuthRepository,
    private val fingerprintHardwareManager: FingerprintHardwareManager
) : BaseViewModel() {

    private val _loginStage = MutableStateFlow(LoginStage.METHOD_SELECTION)
    val loginStage = _loginStage.asStateFlow()

    private val _identifiedInmate = MutableStateFlow<InmateProfile?>(null)
    val identifiedInmate = _identifiedInmate.asStateFlow()

    private val _identifiedAdmin = MutableStateFlow<AdminProfile?>(null)
    val identifiedAdmin = _identifiedAdmin.asStateFlow()

    private val _faceQuality = MutableStateFlow(FaceAuthProcessor.FaceQuality.GOOD)
    val faceQuality = _faceQuality.asStateFlow()

    private val _navigationEvent = MutableSharedFlow<LoginNavigation>()
    val navigationEvent = _navigationEvent.asSharedFlow()

    val connectedScanner = fingerprintHardwareManager.connectedScanner
    val usbPermissionGranted = fingerprintHardwareManager.hasPermission

    private val _isNetworkAvailable = MutableStateFlow(true)
    val isNetworkAvailable = _isNetworkAvailable.asStateFlow()

    private val connectivityManager: ConnectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            _isNetworkAvailable.value = true
        }

        override fun onLost(network: Network) {
            _isNetworkAvailable.value = false
        }

        override fun onCapabilitiesChanged(
            network: Network,
            capabilities: NetworkCapabilities
        ) {
            // CRITICAL: when the SAME network loses and regains INTERNET
            // capability (WiFi blip), onAvailable is NOT re-fired — only this
            // callback is. Without it the app stays "offline" forever until
            // restarted.
            _isNetworkAvailable.value =
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        }
    }

    init {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, networkCallback)
    }

    override fun onCleared() {
        super.onCleared()
        connectivityManager.unregisterNetworkCallback(networkCallback)
    }

    private fun getFriendlyErrorMessage(statusCode: Int?, defaultMessage: String): String {
        return when (statusCode) {
            401, 403 -> "Unauthorized access. Please contact administrator."
            404 -> "Record not found. Please try again."
            else -> defaultMessage // Always show user-friendly message, never raw backend errors
        }
    }

    fun startFaceAuth() {
        _loginStage.value = LoginStage.FACE_SCANNING
    }

    fun startFingerprintAuth() {
        _loginStage.value = LoginStage.FINGERPRINT_SCANNING
        fingerprintHardwareManager.scanForDevices()
    }

    fun requestUsbPermission() {
        val device = fingerprintHardwareManager.connectedScanner.value
        if (device != null) {
            fingerprintHardwareManager.requestPermission(device)
        }
    }

    fun onFaceDetected(quality: FaceAuthProcessor.FaceQuality) {
        _faceQuality.value = quality
    }

    fun onValidFaceCaptured(bitmap: Bitmap) {
        if (uiState.value is UiState.Loading) return

        launch {
            setLoading()

            authRepository.identifyFace(bitmap).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _identifiedInmate.value = result.data
                        _loginStage.value = LoginStage.PIN_ENTRY
                        setSuccess()
                    }
                    is NetworkResult.Failure -> {
                        val errorMessage = getFriendlyErrorMessage(
                            statusCode = result.statusCode,
                            defaultMessage = "Face recognition failed. Please try again."
                        )
                        setError(errorMessage)
                        delay(2000.milliseconds)
                        setIdle()
                    }
                    else -> {}
                }
            }
        }
    }

    fun onPinSubmit(pin: String) {
        val inmateId = _identifiedInmate.value?.inmateId ?: return
        if (uiState.value is UiState.Loading) return

        launch {
            setLoading()

            authRepository.verifyPin(inmateId, pin).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        setSuccess()
                        delay(200.milliseconds) // Wait for session persistence
                        _navigationEvent.emit(LoginNavigation.NavigateToDashboard)
                    }
                    is NetworkResult.Failure -> {
                        val errorMessage = getFriendlyErrorMessage(
                            statusCode = result.statusCode,
                            defaultMessage = "Incorrect PIN. Please try again."
                        )
                        setError(errorMessage)
                        delay(1500.milliseconds)
                        setIdle()
                    }
                    else -> {}
                }
            }
        }
    }

    fun onAdminPasswordSubmit(password: String) {
        val adminId = _identifiedAdmin.value?.adminId
        val kioskId = authRepository.getVerifiedKiosk()?.kioskId ?: Constants.KIOSK_ID
        if (uiState.value is UiState.Loading) return

        Logger.d("LoginViewModel: Admin password submission started for adminId: $adminId, kioskId: $kioskId")

        if (adminId == null) {
            Logger.e("LoginViewModel: Cannot submit Admin password - adminId is NULL")
            setError("Session expired. Please start again.")
            _loginStage.value = LoginStage.METHOD_SELECTION
            return
        }

        launch {
            setLoading()

            val request = AdminVerifyPasswordRequest(adminId, password, kioskId)
            authRepository.adminVerifyPassword(request).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        Logger.i("LoginViewModel: Admin login SUCCESS")
                        setSuccess()
                        delay(200.milliseconds) // Wait for session persistence
                        _navigationEvent.emit(LoginNavigation.NavigateToAdminDashboard)
                    }
                    is NetworkResult.Failure -> {
                        Logger.w("LoginViewModel: Admin login FAILED: ${result.error.message}")
                        val errorMessage = getFriendlyErrorMessage(
                            statusCode = result.statusCode,
                            defaultMessage = "Incorrect password. Please try again."
                        )
                        setError(errorMessage)
                        delay(1500.milliseconds)
                        setIdle()
                    }
                    else -> {}
                }
            }
        }
    }

    fun startAdminAuth() {
        _loginStage.value = LoginStage.ADMIN_USERNAME_ENTRY
        _identifiedAdmin.value = null
    }

    fun onAdminUsernameSubmit(username: String) {
        if (username.isNullOrBlank()) return
        if (uiState.value is UiState.Loading) return

        Logger.d("LoginViewModel: Admin username submitted: $username")
        setLoading()

        val kioskId = authRepository.getVerifiedKiosk()?.kioskId ?: Constants.KIOSK_ID
        val request = LoginRequest(kioskId, null, null, null, username)

        launch {
            authRepository.adminLogin(request).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        Logger.i("LoginViewModel: Admin identified: ${result.data.name}")
                        _identifiedAdmin.value = result.data
                        _loginStage.value = LoginStage.ADMIN_PIN_ENTRY
                        setSuccess()
                    }
                    is NetworkResult.Failure -> {
                        Logger.w("LoginViewModel: Admin identification failed: ${result.error.message}")
                        val errorMessage = getFriendlyErrorMessage(
                            statusCode = result.statusCode,
                            defaultMessage = "Admin not found for this kiosk"
                        )
                        setError(errorMessage)
                        delay(1500.milliseconds)
                        setIdle()
                    }
                    else -> {}
                }
            }
        }
    }

    fun startRfidAuth() {
        _loginStage.value = LoginStage.RFID_SCANNING
    }

    fun onRfidScanned(rfidToken: String) {
        if (uiState.value is UiState.Loading) return

        launch {
            setLoading()

            val kioskId = authRepository.getVerifiedKiosk()?.kioskId ?: Constants.KIOSK_ID
            val request = LoginRequest(kioskId, null, rfidToken, null)

            authRepository.identifyRfid(request).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _identifiedInmate.value = result.data
                        _loginStage.value = LoginStage.PIN_ENTRY
                        setSuccess()
                    }
                    is NetworkResult.Failure -> {
                        val errorMessage = getFriendlyErrorMessage(
                            statusCode = result.statusCode,
                            defaultMessage = "RFID card not recognized. Please try again."
                        )
                        setError(errorMessage)
                        delay(2000.milliseconds)
                        setIdle()
                    }
                    else -> {}
                }
            }
        }
    }

    fun startPrisonerIdEntry() {
        _loginStage.value = LoginStage.PRISONER_ID_ENTRY
    }

    fun onPrisonerIdSubmit(prisonerId: String) {
        if (prisonerId.isNullOrBlank()) return
        if (uiState.value is UiState.Loading) return

        launch {
            setLoading()
            authRepository.identifyPrisoner(prisonerId).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        _identifiedInmate.value = result.data
                        _loginStage.value = LoginStage.PIN_ENTRY
                        setSuccess()
                    }
                    is NetworkResult.Failure -> {
                        val errorMessage = getFriendlyErrorMessage(
                            statusCode = result.statusCode,
                            defaultMessage = "Prisoner ID not recognized. Please try again."
                        )
                        setError(errorMessage)
                        delay(2000.milliseconds)
                        setIdle()
                    }
                    else -> {}
                }
            }
        }
    }

    fun resetToSelection() {
        _loginStage.value = LoginStage.METHOD_SELECTION
        _identifiedInmate.value = null
        _identifiedAdmin.value = null
        setIdle()
    }

    sealed class LoginNavigation {
        data object NavigateToDashboard : LoginNavigation()
        data object NavigateToAdminDashboard : LoginNavigation()
    }
}
