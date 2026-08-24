package com.prisonconnect.kiosk.ui.call

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.models.call.SignalingStatus
import com.prisonconnect.kiosk.models.call.SocketStatus
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.CallRepository
import com.prisonconnect.kiosk.repository.ContactRepository
import com.prisonconnect.kiosk.repository.InmateRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.*
import org.webrtc.EglBase
import org.webrtc.PeerConnection
import org.webrtc.VideoTrack
import javax.inject.Inject

enum class CallUIState {
    IDLE,
    WAITING,
    CONNECTED,
    RECONNECTING,
    DISCONNECTED,
    FAILED
}

@HiltViewModel
class CallViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val callRepository: CallRepository,
    private val inmateRepository: InmateRepository,
    private val contactRepository: ContactRepository,
    private val authRepository: AuthRepository,
    private val webRtcManager: WebRtcManager
) : BaseViewModel() {

    private val _callState = MutableStateFlow(CallUIState.IDLE)
    val callState = _callState.asStateFlow()

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

    val socketStatus: StateFlow<SocketStatus> = callRepository.socketStatus
    val signalingStatus: StateFlow<SignalingStatus> = callRepository.signalingStatus

    val localVideoTrack: StateFlow<VideoTrack?> = webRtcManager.localVideoTrackFlow
    val remoteVideoTrack: StateFlow<VideoTrack?> = webRtcManager.remoteVideoTrack
    val rtcConnectionState: StateFlow<PeerConnection.PeerConnectionState> = webRtcManager.connectionState

    private val _isNetworkAvailable = MutableStateFlow(true)
    val isNetworkAvailable = _isNetworkAvailable.asStateFlow()

    private val _isRecording = MutableStateFlow(true) // Simulating production recording
    val isRecording = _isRecording.asStateFlow()

    private val eglBase = EglBase.create()
    val eglContext: EglBase.Context = eglBase.eglBaseContext

    private var timerJob: Job? = null

    // True only while a call session is actually running (between initCall()
    // and onCleared()). The underlying WebRtcManager is a @Singleton whose
    // connectionState keeps values from previous sessions, and initCall()
    // itself emits CLOSED via its defensive endCall(). Without this gate the
    // collector maps those stale/synthetic CLOSED|FAILED states to
    // DISCONNECTED|FAILED and the UI backs out of the call before it even
    // joins the room.
    private var callSessionActive = false

    // Fails the call if media/signaling never reaches CONNECTED (e.g. the
    // signaling server is down or ICE cannot reach the media server) instead
    // of leaving the user stuck on "Waiting..." forever.
    private var connectWatchdog: Job? = null

    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            _isNetworkAvailable.value = true
        }

        override fun onLost(network: Network) {
            _isNetworkAvailable.value = false
        }
    }

    init {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, networkCallback)

        observeRtcState()
        loadProfiles()
    }

    private fun observeRtcState() {
        launch {
            rtcConnectionState.collect { state ->
                if (!callSessionActive) return@collect  // stale value from a previous/tearing-down session
                when (state) {
                    PeerConnection.PeerConnectionState.CONNECTED -> {
                        connectWatchdog?.cancel()
                        _callState.value = CallUIState.CONNECTED
                        startTimer()
                    }
                    PeerConnection.PeerConnectionState.CONNECTING -> {
                        if (_callState.value != CallUIState.IDLE) {
                            _callState.value = CallUIState.RECONNECTING
                        } else {
                            _callState.value = CallUIState.WAITING
                        }
                    }
                    PeerConnection.PeerConnectionState.DISCONNECTED -> {
                        _callState.value = CallUIState.RECONNECTING
                    }
                    PeerConnection.PeerConnectionState.FAILED -> {
                        _callState.value = CallUIState.FAILED
                    }
                    PeerConnection.PeerConnectionState.CLOSED -> {
                        _callState.value = CallUIState.DISCONNECTED
                    }
                    else -> {}
                }
            }
        }
    }

    private fun loadProfiles() {
        launch {
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            inmateRepository.getProfile(inmateId).collect { result ->
                if (result is NetworkResult.Success) _inmateProfile.value = result.data
            }
        }
        launch {
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            contactRepository.getContacts(inmateId).collect { result ->
                if (result is NetworkResult.Success) {
                    // Match by name or just pick first for demo if multiple
                    _contactProfile.value = result.data.firstOrNull()
                }
            }
        }
    }

    fun initCall(context: Context, roomId: String, isVideoCall: Boolean = true) {
        _callState.value = CallUIState.WAITING
        // Deactivate first so the CLOSED emitted by the defensive endCall()
        // below is not interpreted as "the call disconnected".
        callSessionActive = false
        webRtcManager.endCall()
        webRtcManager.init(context, eglContext)
        webRtcManager.startCall(roomId, context, isVideoCall)
        callSessionActive = true

        connectWatchdog?.cancel()
        connectWatchdog = viewModelScope.launch {
            delay(45_000)
            if (_callState.value == CallUIState.WAITING || _callState.value == CallUIState.RECONNECTING) {
                Logger.e("Call never reached CONNECTED within 45s — failing (check signaling/media servers)")
                _callState.value = CallUIState.FAILED
            }
        }
    }

    private fun startTimer() {
        if (timerJob != null) return
        timerJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                _timerSeconds.value++
                if (_timerSeconds.value >= 300) { // 5 minutes limit
                    break
                }
            }
        }
    }

    fun toggleMute() {
        _isMuted.value = !_isMuted.value
        webRtcManager.toggleAudio(!_isMuted.value)
    }

    fun toggleCamera() {
        _isCameraOn.value = !_isCameraOn.value
        webRtcManager.toggleVideo(_isCameraOn.value)
    }

    fun toggleSpeaker() {
        _isSpeakerOn.value = !_isSpeakerOn.value
        webRtcManager.setSpeakerphoneOn(context, _isSpeakerOn.value)
    }

    fun switchCamera() {
        webRtcManager.switchCamera()
    }

    override fun onCleared() {
        super.onCleared()
        callSessionActive = false  // stop reacting to endCall()'s CLOSED emission
        connectivityManager.unregisterNetworkCallback(networkCallback)
        webRtcManager.endCall()
        eglBase.release()
    }
}
