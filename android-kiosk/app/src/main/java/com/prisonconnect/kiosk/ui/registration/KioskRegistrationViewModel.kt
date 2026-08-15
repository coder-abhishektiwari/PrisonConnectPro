package com.prisonconnect.kiosk.ui.registration

import android.content.Context
import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.core.SessionManager
import com.prisonconnect.kiosk.hardware.DeviceInfoProvider
import com.prisonconnect.kiosk.models.auth.KioskRegistrationRequest
import com.prisonconnect.kiosk.models.auth.Prison
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class RegistrationStep {
    SELECT_JAIL,
    ENTER_PIN,
    SUBMIT_DEVICE_INFO,
    PENDING_APPROVAL
}

data class RegistrationUiState(
    val currentStep: RegistrationStep = RegistrationStep.SELECT_JAIL,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,

    // Step 1: Jail ID Input (Manual)
    val prisonIdInput: String = "",

    // Step 2: Setup PIN
    val setupPin: String = "",

    // Step 3: Device Details
    val locationInput: String = "Main Entrance Gate",
    val deviceSerial: String = "",
    val deviceModel: String = "",
    val deviceBrand: String = "",
    val ipAddress: String = "",
    val androidVersion: String = "",
    val appVersion: String = "1.0.0",
    val deviceFingerprint: String = "",

    // Step 4: Pending state
    val kioskId: String = "",
    val requestId: String = "",
    val approvalStatus: String = "pending",
    val isApproved: Boolean = false
)

@HiltViewModel
class KioskRegistrationViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val deviceInfoProvider: DeviceInfoProvider,
    private val sessionManager: SessionManager,
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegistrationUiState())
    val uiState: StateFlow<RegistrationUiState> = _uiState.asStateFlow()

    private var pollingJob: Job? = null

    init {
        collectDeviceInfo()
        checkExistingRegistrationState()
    }

    private fun checkExistingRegistrationState() {
        viewModelScope.launch {
            val status = sessionManager.getRegistrationStatus()
            val reqId = sessionManager.getRegistrationRequestId()
            if (status == "pending" && !reqId.isNullOrEmpty()) {
                _uiState.update {
                    it.copy(
                        currentStep = RegistrationStep.PENDING_APPROVAL,
                        requestId = reqId,
                        kioskId = reqId,
                        approvalStatus = "pending"
                    )
                }
                startPollingStatus()
            }
        }
    }

    private fun collectDeviceInfo() {
        val rawSerial = deviceInfoProvider.getDeviceSerialNumber()
        val fallbackSerial = try {
            "KIOSK-DEV-${Build.SERIAL?.take(8) ?: "UNKNOWN"}"
        } catch (e: Exception) {
            "KIOSK-DEV-UNKNOWN"
        }
        val serial = if (rawSerial.isNullOrBlank()) fallbackSerial else rawSerial
        val ip = deviceInfoProvider.getIpAddress() ?: "0.0.0.0"
        val fingerprint = deviceInfoProvider.getDeviceFingerprint() ?: "no-fingerprint"
        val model = Build.MODEL ?: "Unknown Model"
        val brand = Build.MANUFACTURER ?: "Unknown Brand"
        val androidVer = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"

        _uiState.update {
            it.copy(
                deviceSerial = serial,
                deviceModel = model,
                deviceBrand = brand,
                ipAddress = ip,
                androidVersion = androidVer,
                deviceFingerprint = fingerprint
            )
        }
    }

    fun onPrisonIdChange(id: String) {
        _uiState.update { it.copy(prisonIdInput = id.uppercase(), errorMessage = null) }
    }

    fun onPinChange(pin: String) {
        if (pin.length <= 6) {
            _uiState.update { it.copy(setupPin = pin, errorMessage = null) }
        }
    }

    fun onLocationChange(location: String) {
        _uiState.update { it.copy(locationInput = location) }
    }

    fun goToPinStep() {
        if (_uiState.value.prisonIdInput.isNullOrBlank()) {
            _uiState.update { it.copy(errorMessage = "Please enter a valid Jail ID") }
            return
        }
        _uiState.update { it.copy(currentStep = RegistrationStep.ENTER_PIN, errorMessage = null) }
    }

    fun validatePinAndProceed() {
        val prisonId = _uiState.value.prisonIdInput
        val pin = _uiState.value.setupPin

        if (pin.length < 6) {
            _uiState.update { it.copy(errorMessage = "Setup PIN must be 6 digits") }
            return
        }

        viewModelScope.launch {
            authRepository.validateSetupPin(prisonId, pin).collect { result ->
                when (result) {
                    is NetworkResult.Idle -> {}
                    is NetworkResult.Loading -> _uiState.update { it.copy(isLoading = true) }
                    is NetworkResult.Success -> {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                currentStep = RegistrationStep.SUBMIT_DEVICE_INFO,
                                errorMessage = null
                            )
                        }
                    }
                    is NetworkResult.Failure -> {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = result.error.message ?: "Invalid Jail ID or Setup PIN"
                            )
                        }
                    }
                }
            }
        }
    }

    fun submitRegistration() {
        val currentState = _uiState.value
        val prisonId = currentState.prisonIdInput

        // Sanitize strings to prevent malformed JSON
        fun String.sanitize(): String {
            return this.replace("\\", "/")
                       .replace("\"", "")
                       .replace("\n", " ")
                       .replace("\r", " ")
                       .replace("\t", " ")
                       .trim()
        }

        val request = KioskRegistrationRequest(
            prisonId = prisonId.sanitize(),
            deviceSerialNumber = currentState.deviceSerial.sanitize(),
            deviceModel = currentState.deviceModel.sanitize(),
            deviceBrand = currentState.deviceBrand.sanitize(),
            ipAddress = currentState.ipAddress.sanitize(),
            location = currentState.locationInput.sanitize(),
            androidVersion = currentState.androidVersion.sanitize(),
            appVersion = currentState.appVersion.sanitize(),
            deviceFingerprint = currentState.deviceFingerprint.sanitize()
        )

        viewModelScope.launch {
            authRepository.registerKiosk(request).collect { result ->
                when (result) {
                    is NetworkResult.Idle -> {}
                    is NetworkResult.Loading -> _uiState.update { it.copy(isLoading = true) }
                    is NetworkResult.Success -> {
                        val kioskId = result.data.kioskId.orEmpty().ifEmpty { result.data.requestId.orEmpty() }
                        val requestId = result.data.requestId.orEmpty().ifEmpty { kioskId }
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                currentStep = RegistrationStep.PENDING_APPROVAL,
                                // 💡 .orEmpty() se String? convert ho ke safe non-null String ban jayega
                                kioskId = kioskId,
                                requestId = requestId,
                                approvalStatus = result.data.status.orEmpty().ifEmpty { "pending" },
                                errorMessage = null
                            )
                        }
                        sessionManager.saveRegistrationState(
                            status = "pending",
                            prisonId = currentState.prisonIdInput,
                            requestId = requestId
                        )
                        startPollingStatus()
                    }
                    is NetworkResult.Failure -> {
                        val errorMsg = result.error?.message.orEmpty().ifEmpty { "Failed to submit registration request" }
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = errorMsg
                            )
                        }
                    }
                }
            }
        }
    }

    fun startPollingStatus() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            val id = _uiState.value.kioskId.ifBlank { _uiState.value.deviceSerial }
            while (true) {
                var shouldStop = false
                authRepository.getRegistrationStatus(id).collect { result ->
                    when (result) {
                        is NetworkResult.Success -> {
                            val status = result.data.status
                            if (status == "approved") {
                                _uiState.update {
                                    it.copy(
                                        approvalStatus = "approved",
                                        isApproved = true,
                                        isLoading = false
                                    )
                                }
                                val kioskId = _uiState.value.kioskId.ifBlank { _uiState.value.deviceSerial }
                                sessionManager.saveRegistrationState("approved", requestId = kioskId)
                                shouldStop = true
                            } else if (status == "rejected") {
                                _uiState.update {
                                    it.copy(
                                        approvalStatus = "rejected",
                                        errorMessage = "Registration was rejected by the Warden. Please contact administration."
                                    )
                                }
                            }
                        }
                        is NetworkResult.Failure -> {
                            if (result.statusCode == 404) {
                                resetForReRegistration(
                                    "Registration record not found on server. Please register this kiosk again."
                                )
                                shouldStop = true
                            }
                        }
                        else -> { /* Loading / Idle: keep polling */ }
                    }
                }
                if (shouldStop) break
                delay(15_000) // Poll every 15 seconds
            }
        }
    }

    /**
     * Resets the flow back to the Jail ID step when the registration record no
     * longer exists (e.g. the backend was re-seeded and wiped it). Lets the
     * operator register the device again.
     */
    private fun resetForReRegistration(errorMessage: String) {
        pollingJob?.cancel()
        viewModelScope.launch {
            sessionManager.clearRegistrationState()
        }
        _uiState.update {
            it.copy(
                currentStep = RegistrationStep.SELECT_JAIL,
                isLoading = false,
                requestId = "",
                kioskId = "",
                approvalStatus = "pending",
                isApproved = false,
                errorMessage = errorMessage
            )
        }
    }

    fun checkStatusManually() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val id = _uiState.value.kioskId.ifBlank { _uiState.value.deviceSerial }
            authRepository.getRegistrationStatus(id).collect { result ->
                when (result) {
                    is NetworkResult.Idle -> {}
                    is NetworkResult.Loading -> _uiState.update { it.copy(isLoading = true) }
                    is NetworkResult.Success -> {
                        val status = result.data.status
                        if (status == "approved") {
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    approvalStatus = "approved",
                                    isApproved = true
                                )
                            }
                            val kioskId = _uiState.value.kioskId.ifBlank { _uiState.value.deviceSerial }
                            sessionManager.saveRegistrationState("approved", requestId = kioskId)
                        } else {
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    approvalStatus = status.orEmpty(),
                                    errorMessage = if (status == "rejected") "Registration rejected by Warden" else "Still pending Warden approval..."
                                )
                            }
                        }
                    }
                    is NetworkResult.Failure -> {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = result.error.message ?: "Failed to check status"
                            )
                        }
                    }
                }
            }
        }
    }

    fun backToPreviousStep() {
        val previousStep = when (_uiState.value.currentStep) {
            RegistrationStep.ENTER_PIN -> RegistrationStep.SELECT_JAIL
            RegistrationStep.SUBMIT_DEVICE_INFO -> RegistrationStep.ENTER_PIN
            else -> RegistrationStep.SELECT_JAIL
        }
        _uiState.update { it.copy(currentStep = previousStep, errorMessage = null) }
    }

    override fun onCleared() {
        super.onCleared()
        pollingJob?.cancel()
    }
}
