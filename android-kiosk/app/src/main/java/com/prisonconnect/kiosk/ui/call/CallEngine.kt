package com.prisonconnect.kiosk.ui.call

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.prisonconnect.kiosk.R
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.models.call.CallStatusSnapshot
import com.prisonconnect.kiosk.models.call.EndCallRequest
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

        /** How long a DISCONNECTED state must persist before the UI says so. */
        const val RECONNECT_DEBOUNCE_MS = 4_000L

        /** Grace window before a peer-left (socket blip) actually ends the call. */
        const val PEER_LEFT_GRACE_MS = 15_000L

        /**
         * With optimistic navigation the call record may legitimately not exist
         * for the first seconds (POST /calls still in flight). If the status
         * poll misses this many times in a row (~50s), creation truly failed.
         */
        const val POLL_FAIL_THRESHOLD = 15

        /** How stale the family heartbeat may get before we say they left. */
        const val FAMILY_LEFT_STALE_MS = 15_000L
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

    /** Family-side verification failures — shown red on the progress screen. */
    private val _deviceVerifyFailed = MutableStateFlow(false)
    val deviceVerifyFailed = _deviceVerifyFailed.asStateFlow()

    private val _otpVerifyFailed = MutableStateFlow(false)
    val otpVerifyFailed = _otpVerifyFailed.asStateFlow()

    /** Family member closed the verification screen mid-flow. */
    private val _familyLeft = MutableStateFlow(false)
    val familyLeft = _familyLeft.asStateFlow()

    /** Per-minute rate for THIS call (video/audio differ) — from the call record. */
    private val _ratePerMinute = MutableStateFlow(0.0)

    /**
     * Live billing: ceil(seconds / 60) × rate. A new minute is charged the
     * moment it STARTS, even if it is not consumed in full.
     */
    private val _liveCost = MutableStateFlow(0.0)
    val liveCost = _liveCost.asStateFlow()

    /**
     * Warden-controlled max call length in seconds (from Settings on the
     * warden dashboard). Falls back to 5 minutes until the call record loads.
     */
    private val _maxCallSeconds = MutableStateFlow(MAX_CALL_SECONDS)
    val maxCallSeconds = _maxCallSeconds.asStateFlow()

    /**
     * User-facing reason the call just ended, or null for a plain hangup.
     * Set once in [endSession] and consumed by the call screen and the
     * receipt, so a time-limit cut never looks like a normal hangup.
     */
    private val _endLabel = MutableStateFlow<String?>(null)
    val endLabel: StateFlow<String?> = _endLabel.asStateFlow()

    /** UI badge: the kiosk always records calls (KioskCallRecorder). */
    private val _isRecording = MutableStateFlow(true)
    val isRecording = _isRecording.asStateFlow()

    /**
     * Live WebRTC quality ("excellent" | "good" | "fair" | "poor" | "unknown"),
     * sampled every second off the peer connection. Drives the on-screen
     * connection badge — the old badge was a hardcoded green "Stable
     * Connection" that lied even when the line had collapsed.
     */
    private val _connectionQuality = MutableStateFlow("unknown")
    val connectionQuality = _connectionQuality.asStateFlow()

    var activeCallId: String? = null
        private set

    private var timerJob: Job? = null
    private var pollJob: Job? = null
    private var reconnectJob: Job? = null
    private var statsReportJob: Job? = null
    @Volatile private var callSessionActive = false

    /**
     * Room this session is joined to. Signaling events carry a roomId and any
     * event for a different room belongs to a previous session — it must never
     * end the current call.
     */
    @Volatile private var activeRoomId: String? = null

    /** Kept at class scope so initCall/endSession can cancel a pending one. */
    private var peerLeftGraceJob: Job? = null

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { _isNetworkAvailable.value = true }
        override fun onLost(network: Network) { _isNetworkAvailable.value = false }

        override fun onCapabilitiesChanged(
            network: Network,
            capabilities: NetworkCapabilities
        ) {
            // Same-network WiFi blips never re-fire onAvailable — only this
            // does. Keeps the in-call network banner honest after recovery.
            _isNetworkAvailable.value =
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        }
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

    /**
     * True when a signaling event belongs to THIS session. Events from another
     * room (a previous call on this kiosk, or a room torn down earlier) are
     * dropped. Payloads without a roomId fall back to the session-active check
     * so an older signaling server still works.
     */
    private fun isCurrentRoom(data: Any?): Boolean {
        val eventRoomId = (data as? org.json.JSONObject)?.optString("roomId").orEmpty()
        if (eventRoomId.isEmpty()) return true
        val current = activeRoomId ?: return false
        return eventRoomId == current
    }

    /** Stops the session cleanly when the other side (or warden) ends it. */
    private fun observeRemoteEnd() {
        scope.launch {
            callRepository.observeSignalingEvents().collect { event ->
                when (event.type) {
                    // An explicit remote hang-up (or warden disconnect) is
                    // final — end immediately, no grace.
                    "call-ended" -> {
                        if (!isCurrentRoom(event.data)) return@collect
                        peerLeftGraceJob?.cancel(); peerLeftGraceJob = null
                        if (callSessionActive) {
                            Logger.d("Call ended remotely (call-ended) - stopping session")
                            endSession()
                        }
                    }
                    // A socket blip on the OTHER side triggers peer-left well
                    // before the P2P media path actually dies. Only end after a
                    // grace window so a transient drop doesn't kill the call.
                    // If the peer rejoins inside the window, cancel the pending end.
                    "peer-left" -> {
                        if (!callSessionActive || !isCurrentRoom(event.data)) return@collect
                        Logger.d("Peer left - starting ${PEER_LEFT_GRACE_MS}ms grace")
                        peerLeftGraceJob?.cancel()
                        peerLeftGraceJob = scope.launch {
                            delay(PEER_LEFT_GRACE_MS)
                            if (callSessionActive) {
                                Logger.d("Peer did not return in grace - ending call")
                                endSession()
                            }
                        }
                    }
                    "peer-joined" -> {
                        if (!isCurrentRoom(event.data)) return@collect
                        // The other side came back (its socket reconnected) —
                        // a peer-left was just a transient blip. Cancel ending.
                        if (peerLeftGraceJob?.isActive == true) {
                            Logger.d("Peer rejoined - cancelling peer-left grace end")
                            peerLeftGraceJob?.cancel()
                            peerLeftGraceJob = null
                        }
                    }
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
                        // A single transient DISCONNECTED must not flash the
                        // reconnect banner — cancel any pending one.
                        reconnectJob?.cancel(); reconnectJob = null
                        _callState.value = CallUIState.CONNECTED
                        // Route audio to the loudspeaker so both sides are
                        // clearly audible on a kiosk device.
                        if (!_isSpeakerOn.value) {
                            _isSpeakerOn.value = true
                        }
                        webRtcManager.setSpeakerphoneOn(context, true)
                        // Audio health diagnostics: proves the mic track is
                        // live and enabled when family reports missing sound.
                        webRtcManager.logAudioHealth()
                        startTimer()
                        startStatsReporting()
                    }
                    PeerConnection.PeerConnectionState.CONNECTING -> {
                        if (_familyStage.value != FamilyStage.CONNECTING_MEDIA) {
                            _familyStage.value = FamilyStage.CONNECTING_MEDIA
                        }
                        _callState.value = CallUIState.WAITING
                    }
                    PeerConnection.PeerConnectionState.DISCONNECTED -> {
                        // WebRTC fires DISCONNECTED for brief hiccups that heal
                        // on their own. Only surface "reconnecting" when the
                        // state actually persists.
                        if (_callState.value == CallUIState.CONNECTED && reconnectJob?.isActive != true) {
                            reconnectJob = scope.launch {
                                delay(RECONNECT_DEBOUNCE_MS)
                                if (rtcConnectionState.value == PeerConnection.PeerConnectionState.DISCONNECTED &&
                                    callSessionActive
                                ) {
                                    _callState.value = CallUIState.RECONNECTING
                                    _callFailedAfterConnect.value = true
                                }
                            }
                        }
                    }
                    PeerConnection.PeerConnectionState.FAILED -> {
                        reconnectJob?.cancel(); reconnectJob = null
                        if (_callState.value == CallUIState.CONNECTED ||
                            _callState.value == CallUIState.RECONNECTING
                        ) {
                            _callFailedAfterConnect.value = true
                        }
                        // Full teardown + backend finalize. Without this the
                        // session stayed "active": the stats loop kept PATCHing
                        // a dead call and the record only cleared on the 2-min
                        // sweep. The UI keeps FAILED (not DISCONNECTED) so the
                        // "Call Failed" screen still shows.
                        endSession(terminalState = CallUIState.FAILED)
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
        // Scope signaling events to this room and drop any grace timer that
        // still belongs to the previous session.
        activeRoomId = roomId
        peerLeftGraceJob?.cancel(); peerLeftGraceJob = null
        activeCallId = callId
        _familyStage.value = FamilyStage.LINK_SENT
        _callFailedAfterConnect.value = false
        _deviceVerifyFailed.value = false
        _otpVerifyFailed.value = false
        _familyLeft.value = false
        _ratePerMinute.value = 0.0
        _liveCost.value = 0.0
        _maxCallSeconds.value = MAX_CALL_SECONDS
        _endLabel.value = null
        _connectionQuality.value = "unknown"
        _callState.value = CallUIState.WAITING
        timerJob?.cancel(); timerJob = null
        reconnectJob?.cancel(); reconnectJob = null
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
     *
     * With optimistic navigation the record may 404 for the first few seconds
     * (POST /calls still in flight) — that is normal. But if it NEVER appears
     * within [POLL_FAIL_THRESHOLD] polls, creation failed: surface "Call Failed".
     */
    private fun startFamilyPolling(callId: String?) {
        pollJob?.cancel()
        if (callId.isNullOrBlank()) return
        pollJob = scope.launch {
            var consecutiveFailures = 0
            while (callSessionActive && _callState.value != CallUIState.CONNECTED) {
                when (val r = callRepository.getCallStatus(callId).first()) {
                    is NetworkResult.Success -> {
                        consecutiveFailures = 0
                        applySnapshot(r.data)
                    }
                    else -> {
                        consecutiveFailures++
                        Logger.d("Call status poll unavailable ($consecutiveFailures/${POLL_FAIL_THRESHOLD}), retrying...")
                        if (consecutiveFailures >= POLL_FAIL_THRESHOLD) {
                            Logger.e("Call record never appeared - failing call")
                            // Full teardown: without this callSessionActive
                            // stayed true and the stats loop kept running.
                            endSession(terminalState = CallUIState.FAILED)
                            return@launch
                        }
                    }
                }
                delay(3000)
            }
        }
    }

    private fun applySnapshot(s: CallStatusSnapshot) {
        val fam = s.family ?: return
        // Per-minute billing rate for this call (video ₹2.5 / audio ₹1.0 etc.).
        s.ratePerMinute?.takeIf { it > 0 }?.let { _ratePerMinute.value = it }
        // Warden-controlled max call length.
        s.maxDurationMinutes?.takeIf { it > 0 }?.let { _maxCallSeconds.value = it * 60 }
        // Verification failures (wrong OTP / device mismatch) — the progress
        // screen marks these steps red until they succeed.
        _deviceVerifyFailed.value = (fam.deviceFailedAttempts ?: 0) > 0
        _otpVerifyFailed.value = (fam.otpFailedAttempts ?: 0) > 0

        // Family-left detection: the verification pages heartbeat every 5s.
        // Once the link is open, a stale heartbeat mid-verification means the
        // family member closed the screen.
        if (!_familyLeft.value && !s.linkOpenedAt.isNullOrBlank() && fam.otpVerified != true && !fam.lastSeenAt.isNullOrBlank()) {
            val staleMs = runCatching {
                System.currentTimeMillis() - java.time.Instant.parse(fam.lastSeenAt).toEpochMilli()
            }.getOrDefault(0L)
            if (staleMs > FAMILY_LEFT_STALE_MS) {
                Logger.d("Family heartbeat stale (${staleMs}ms) - family member left")
                _familyLeft.value = true
            }
        }

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
        // Drive the timer off the CLOCK, not off rtcConnectionState emissions.
        // connectionState is a StateFlow, which only re-emits when its value
        // actually changes — so the previous `collect { delay(1000) ... }`
        // form ticked exactly once after connect and then parked forever
        // waiting for a change that never comes while the call is healthy.
        // That meant `_timerSeconds >= _maxCallSeconds` could never become
        // true and the auto-end never fired: the call ran past its limit.
        //
        // Waiting for the family to answer (or a mid-call network dip) still
        // never counts against the quota — the tick is skipped unless media
        // is CONNECTED right now.
        timerJob = scope.launch {
            while (callSessionActive) {
                delay(1000)
                if (!callSessionActive) break
                if (rtcConnectionState.value != PeerConnection.PeerConnectionState.CONNECTED) continue
                _timerSeconds.value++
                // Live billing: charge the new minute the moment it starts
                // (ceiling), even if it is not consumed in full.
                val billedMinutes = kotlin.math.ceil(_timerSeconds.value / 60.0).toInt()
                _liveCost.value = billedMinutes * _ratePerMinute.value
                // Max call duration: warden-controlled via the dashboard;
                // the call auto-ends when the limit of connected talk time
                // is reached.
                if (_timerSeconds.value >= _maxCallSeconds.value) {
                    Logger.d("Max call duration (${_maxCallSeconds.value}s) reached - ending call")
                    // Fully tear down the session (state -> DISCONNECTED,
                    // finalize the backend record) so the UI navigates off
                    // instead of leaving a dead call screen.
                    endSession(
                        reason = "timeout",
                        description = "Call ended — maximum duration reached"
                    )
                    break
                }
            }
        }
    }

    /**
     * Periodic stats reporting: samples connection quality every second for the
     * on-screen badge, and ships it to the backend every 5s so the warden
     * dashboard shows live updates too.
     */
    private fun startStatsReporting() {
        statsReportJob?.cancel()
        statsReportJob = scope.launch {
            var lastReportAt = 0L
            while (callSessionActive) {
                delay(1000)
                val snapshot = webRtcManager.getQualitySnapshot()
                _connectionQuality.value = snapshot.quality
                if (System.currentTimeMillis() - lastReportAt < 5000) continue
                val callId = activeCallId ?: continue
                lastReportAt = System.currentTimeMillis()
                val recordingStatus = if (_isRecording.value) "recording" else "inactive"
                callRepository.reportStats(
                    callId,
                    com.prisonconnect.kiosk.models.call.CallStatsReport(
                        connectionQuality = snapshot.quality,
                        recordingStatus = recordingStatus,
                        iceState = rtcConnectionState.value.name.lowercase(),
                        packetLoss = snapshot.packetLoss,
                        jitter = snapshot.jitter,
                        bitrate = snapshot.bitrate
                    )
                )
            }
        }
    }

    fun toggleMute() { _isMuted.value = !_isMuted.value; webRtcManager.toggleAudio(!_isMuted.value) }
    fun toggleCamera() { _isCameraOn.value = !_isCameraOn.value; webRtcManager.toggleVideo(_isCameraOn.value) }
    fun toggleSpeaker() { _isSpeakerOn.value = !_isSpeakerOn.value; webRtcManager.setSpeakerphoneOn(context, _isSpeakerOn.value) }
    fun switchCamera() { webRtcManager.switchCamera() }

    fun endCall(context: Context) {
        endSession()
    }

    /**
     * Fully tears down an active call session: marks it inactive, cancels all
     * background jobs, closes the WebRTC media path, finalizes the backend call
     * record (so `POST /calls/:callId/end` persists duration/billing) and moves
     * the UI state to [terminalState] so the call screen navigates away.
     *
     * The state the call was IN is read before anything is mutated — reading it
     * after the DISCONNECTED assignment makes every diagnostic branch below
     * dead code.
     *
     * @param terminalState FAILED keeps the "Call Failed" screen instead of the
     *   plain "Call ended" one.
     * @param reason backend `endReason`; null derives one from the real state.
     * @param description backend `endReasonDescription`; null derives one too.
     */
    private fun endSession(
        terminalState: CallUIState = CallUIState.DISCONNECTED,
        reason: String? = null,
        description: String? = null,
    ) {
        // Capture BEFORE mutating — this is the whole point of the fix.
        val endedInState = _callState.value
        val familyStage = _familyStage.value
        val wasConnected = _callFailedAfterConnect.value ||
                endedInState == CallUIState.CONNECTED ||
                endedInState == CallUIState.RECONNECTING

        val wasActive = callSessionActive

        // Backend end reason: real state drives it, so a failed call no longer
        // reports itself as "completed". Computed before anything is mutated so
        // it can also drive the hangup reason sent to the peer.
        val endReason = reason ?: when {
            terminalState == CallUIState.FAILED && wasConnected -> "network_lost"
            terminalState == CallUIState.FAILED -> "webrtc_failed"
            else -> "completed"
        }
        val endDescription = description ?: when {
            _familyLeft.value -> "Family member left the verification screen"
            _deviceVerifyFailed.value -> "Device verification failed"
            _otpVerifyFailed.value -> "OTP verification failed"
            familyStage == FamilyStage.LINK_SENT -> "Call link was sent but not opened"
            familyStage == FamilyStage.LINK_OPENED -> "Family opened the link but did not complete verification"
            terminalState == CallUIState.FAILED && !wasConnected -> "Call media connection failed"
            terminalState == CallUIState.FAILED && wasConnected -> "Call connection lost"
            endedInState == CallUIState.RECONNECTING -> "Call ended — connection unstable"
            else -> null
        }

        // What the receipt and the call screen tell the inmate. Only a time
        // limit earns a specific label — everything else stays "Call ended".
        _endLabel.value = if (wasActive && endReason == "timeout") {
            context.getString(R.string.max_duration_reached, (maxCallSeconds.value + 59) / 60)
        } else null

        callSessionActive = false
        pollJob?.cancel(); pollJob = null
        timerJob?.cancel(); timerJob = null
        statsReportJob?.cancel(); statsReportJob = null
        reconnectJob?.cancel(); reconnectJob = null
        peerLeftGraceJob?.cancel(); peerLeftGraceJob = null
        // Forward the timeout so the family browser shows the same reason
        // instead of treating it as an ordinary hangup.
        webRtcManager.endCall(hangupReason = if (endReason == "timeout") "timeout" else null)
        // NOTE: `_timerSeconds` is deliberately NOT reset here. The receipt is
        // navigated to with `timerSeconds` read at call time — zeroing it in
        // this same synchronous call made every receipt print "0 Sec".
        // initCall() resets it for the next call instead.
        _callState.value = terminalState
        activeRoomId = null

        if (!wasActive) return
        val request = EndCallRequest(
            endReason = endReason,
            endReasonDescription = endDescription,
            familyStage = familyStage.name,
            familyLeft = _familyLeft.value,
            deviceVerifyFailed = _deviceVerifyFailed.value,
            otpVerifyFailed = _otpVerifyFailed.value,
            hasAudio = true,
            hasVideo = true,
        )
        activeCallId?.let { callRepository.notifyCallEnded(it, request) }
    }

    fun teardownIfIdle() {
        // Called when UI fully leaves the flow without an active session.
        if (!callSessionActive) webRtcManager.endCall()
    }
}
