package com.prisonconnect.kiosk.ui.call

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.models.call.CallStatusSnapshot
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.CallRepository
import com.prisonconnect.kiosk.repository.ContactRepository
import com.prisonconnect.kiosk.repository.InmateRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.webrtc.EglBase
import org.webrtc.PeerConnection
import org.webrtc.VideoTrack
import javax.inject.Inject
import javax.inject.Singleton

/** Family-side journey shown on the kiosk progress screen. */
enum class FamilyStage {
    LINK_SENT,
    LINK_OPENED,
    DEVICE_VERIFIED,
    OTP_VERIFIED,
    CONNECTING_MEDIA,
}

enum class CallUIState {
    IDLE, WAITING, CONNECTED, RECONNECTING, DISCONNECTED, FAILED
}

/**
 * Activity-scoped singleton that owns a full call session: WebRTC setup,
 * family-progress polling and media controls. Lives across navigation from
 * the progress screen into the actual call screen.
 */
@Singleton
class CallEngine @Inject constructor(
    @ApplicationContext private val context: Context,
    private val callRepository: CallRepository,
    private val inmateRepository: InmateRepository,
    private val contactRepository: ContactRepository,
    private val authRepository: AuthRepository,
    private val webRtcManager: WebRtcManager
) {
    companion object {
        /** Maximum connected talk-time per call. The call auto-ends after this. */
        const val MAX_CALL_SECONDS = 300
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    val eglContext: EglBase.Context get() = webRtcManager.eglContext(context)

    // ---- Exposed state ----
    private val _callState = MutableStateFlow(CallUIState.IDLE)
    val callState = _callState.asStateFlow()

    private val _familyStage = MutableStateFlow(FamilyStage.LINK_SENT)
    val familyStage = _familyStage.asStateFlow()

    private val _timerSeconds = MutableStateFlow(0)
    val timerSeconds = _timerSeconds.asStateFlow()

    private val _isMuted = MutableStateFlow(false)
    val isMuted = _isMuted.asStateFlow()

    private val _isCameraOn = MutableStateFlow(true)
    val isCameraOn = _isCameraOn.asStateFlow()

    private val _isSpeakerOn = MutableStateFlow(true)
    val isSpeakerOn = _isSpeakerOn.asStateFlow()

    private val _inmateProfile = MutableStateFlow<InmateProfile?>(null)
    val inmateProfile = _inmateProfile.asStateFlow()

    private val _contactProfile = MutableStateFlow<Contact?>(null)
    val contactProfile = _contactProfile.asStateFlow()

    val socketStatus: StateFlow<com.prisonconnect.kiosk.models.call.SocketStatus> = callRepository.socketStatus
    val signalingStatus = callRepository.signalingStatus

    val localVideoTrack: StateFlow<VideoTrack?> = webRtcManager.localVideoTrackFlow
    val remoteVideoTrack: StateFlow<VideoTrack?> = webRtcManager.remoteVideoTrack
    val rtcConnectionState = webRtcManager.connectionState

    private val _isNetworkAvailable = MutableStateFlow(true)
    val isNetworkAvailable = _isNetworkAvailable.asStateFlow()

    private val _callFailedAfterConnect = MutableStateFlow(false)
    val callFailedAfterConnect = _callFailedAfterConnect.asStateFlow()

    /** UI badge: the kiosk always records calls (KioskCallRecorder). */
    private val _isRecording = MutableStateFlow(true)
    val isRecording = _isRecording.asStateFlow()

    var activeCallId: String? = null
        private set

    private var timerJob: Job? = null
    private var pollJob: Job? = null
    @Volatile private var callSessionActive = false

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { _isNetworkAvailable.value = true }
        override fun onLost(network: Network) { _isNetworkAvailable.value = false }
    }

    init {
        connectivityManager.registerNetworkCallback(
            NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),
            networkCallback
        )
        observeRtcState()
        observeRemoteEnd()
        loadProfiles()
    }

    /** Stops the session cleanly when the other side (or warden) ends it. */
    private fun observeRemoteEnd() {
        scope.launch {
            callRepository.observeSignalingEvents().collect { event ->
                if (event.type == "call-ended" && callSessionActive) {
                    Logger.d("Call ended remotely - stopping session")
                    pollJob?.cancel(); pollJob = null
                    webRtcManager.endCall()
                }
            }
        }
    }

    private fun observeRtcState() {
        scope.launch {
            rtcConnectionState.collect { state ->
                if (!callSessionActive) return@collect
                when (state) {
                    PeerConnection.PeerConnectionState.CONNECTED -> {
                        _callState.value = CallUIState.CONNECTED
                        startTimer()
                    }
                    PeerConnection.PeerConnectionState.CONNECTING -> {
                        if (_familyStage.value != FamilyStage.CONNECTING_MEDIA) {
                            _familyStage.value = FamilyStage.CONNECTING_MEDIA
                        }
                        _callState.value = CallUIState.WAITING
                    }
                    PeerConnection.PeerConnectionState.DISCONNECTED -> {
                        if (_callState.value == CallUIState.CONNECTED) {
                            _callState.value = CallUIState.RECONNECTING
                        }
                    }
                    PeerConnection.PeerConnectionState.FAILED -> {
                        if (_callState.value == CallUIState.CONNECTED) {
                            _callFailedAfterConnect.value = true
                        }
                        _callState.value = CallUIState.FAILED
                        // Tear down media NOW so the OS camera/mic privacy
                        // indicators (green dot) clear instead of staying lit.
                        pollJob?.cancel(); pollJob = null
                        timerJob?.cancel(); timerJob = null
                        webRtcManager.endCall()
                    }
                    PeerConnection.PeerConnectionState.CLOSED -> {
                        if (_callState.value == CallUIState.CONNECTED ||
                            _callState.value == CallUIState.RECONNECTING
                        ) {
                            _callFailedAfterConnect.value = true
                        }
                    }
                    else -> {}
                }
            }
        }
    }

    private fun loadProfiles() {
        scope.launch {
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            inmateRepository.getProfile(inmateId).collect { result ->
                if (result is NetworkResult.Success) _inmateProfile.value = result.data
            }
        }
        scope.launch {
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            contactRepository.getContacts(inmateId).collect { result ->
                if (result is NetworkResult.Success) _contactProfile.value = result.data.firstOrNull()
            }
        }
    }

    /** Starts a call session. No-ops when the same room is already live. */
    fun initCall(context: Context, roomId: String, isVideoCall: Boolean = true, callId: String?) {
        if (callSessionActive && roomId == webRtcManager.activeRoomId()) return
        activeCallId = callId
        _familyStage.value = FamilyStage.LINK_SENT
        _callFailedAfterConnect.value = false
        _callState.value = CallUIState.WAITING
        timerJob?.cancel(); timerJob = null
        _timerSeconds.value = 0
        callSessionActive = false
        webRtcManager.endCall()
        webRtcManager.init(context, eglContext)
        webRtcManager.startCall(roomId, context, isVideoCall)
        callSessionActive = true
        startFamilyPolling(callId)
    }

    /**
     * Polls backend for the family member's journey. NO timeout — we wait as
     * long as it takes for the family to open/verify/join.
     */
    private fun startFamilyPolling(callId: String?) {
        pollJob?.cancel()
        if (callId.isNullOrBlank()) return
        pollJob = scope.launch {
            while (callSessionActive && _callState.value != CallUIState.CONNECTED) {
                when (val r = callRepository.getCallStatus(callId).first()) {
                    is NetworkResult.Success -> applySnapshot(r.data)
                    else -> Logger.d("Call status poll unavailable, retrying...")
                }
                delay(3000)
            }
        }
    }

    private fun applySnapshot(s: CallStatusSnapshot) {
        val fam = s.family ?: return
        val target = when {
            fam.otpVerified == true -> FamilyStage.OTP_VERIFIED
            fam.deviceVerified == true -> FamilyStage.DEVICE_VERIFIED
            !s.linkOpenedAt.isNullOrBlank() -> FamilyStage.LINK_OPENED
            else -> FamilyStage.LINK_SENT
        }
        // Advance at most one stage per poll so the progress screen animates
        // instead of jumping straight from LINK_SENT to OTP_VERIFIED.
        val current = _familyStage.value
        if (target.ordinal > current.ordinal) {
            _familyStage.value = FamilyStage.entries[current.ordinal + 1]
        }
    }

    private fun startTimer() {
        if (timerJob != null) return
        // Timer runs ONLY while the media session is CONNECTED — wall-clock
        // waiting for the family to answer never counts against the quota.
        timerJob = scope.launch {
            var connected = false
            rtcConnectionState.collect { state ->
                if (state == PeerConnection.PeerConnectionState.CONNECTED) {
                    connected = true
                } else if (state == PeerConnection.PeerConnectionState.DISCONNECTED ||
                    state == PeerConnection.PeerConnectionState.FAILED ||
                    state == PeerConnection.PeerConnectionState.CLOSED
                ) {
                    connected = false
                }
                if (connected) {
                    delay(1000)
                    _timerSeconds.value++
                    // Max call duration: the call auto-ends after 5 minutes
                    // of actual connected talk time.
                    if (_timerSeconds.value >= MAX_CALL_SECONDS) {
                        Logger.d("Max call duration (${MAX_CALL_SECONDS}s) reached - ending call")
                        webRtcManager.endCall()
                    }
                }
            }
        }
    }

    fun toggleMute() { _isMuted.value = !_isMuted.value; webRtcManager.toggleAudio(!_isMuted.value) }
    fun toggleCamera() { _isCameraOn.value = !_isCameraOn.value; webRtcManager.toggleVideo(_isCameraOn.value) }
    fun toggleSpeaker() { _isSpeakerOn.value = !_isSpeakerOn.value; webRtcManager.setSpeakerphoneOn(context, _isSpeakerOn.value) }
    fun switchCamera() { webRtcManager.switchCamera() }

    fun endCall(context: Context) {
        callSessionActive = false
        pollJob?.cancel(); pollJob = null
        webRtcManager.endCall()
        _timerSeconds.value = 0
    }

    fun teardownIfIdle() {
        // Called when UI fully leaves the flow without an active session.
        if (!callSessionActive) webRtcManager.endCall()
    }
}
