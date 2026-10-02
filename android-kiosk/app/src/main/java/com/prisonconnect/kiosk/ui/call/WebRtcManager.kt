package com.prisonconnect.kiosk.ui.call

import android.content.Context
import android.media.AudioManager
import com.prisonconnect.kiosk.config.AppConfig
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.repository.CallRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RTCStatsCollectorCallback
import org.webrtc.RTCStatsReport
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SoftwareVideoEncoderFactory
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pure 1-to-1 P2P WebRTC manager. Media flows directly between the kiosk and
 * the family browser; the signaling server only relays SDP offers/answers and
 * ICE candidates over Socket.IO. TURN is used strictly as an ICE fallback.
 *
 * Offer/answer glare rule: whoever sees a non-empty `existingPeers` list in
 * their join-room ACK creates the offer; the other side only answers.
 */
@Singleton
class WebRtcManager @Inject constructor(
    private val callRepository: CallRepository,
    private val callRecorder: KioskCallRecorder
) {
    private val managerScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // Collector for signaling events — cancelled and re-created on every
    // startCall() so stale collectors from previous calls don't stack up.
    private var signalingJob: Job? = null

    private var peerConnection: PeerConnection? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var localVideoSource: VideoSource? = null
    private var localVideoTrack: VideoTrack? = null
    private var localAudioSource: AudioSource? = null
    private var localAudioTrack: AudioTrack? = null
    private var videoCapturer: VideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null

    private val _remoteVideoTrack = MutableStateFlow<VideoTrack?>(null)
    val remoteVideoTrack = _remoteVideoTrack.asStateFlow()

    private val _localVideoTrackFlow = MutableStateFlow<VideoTrack?>(null)
    val localVideoTrackFlow = _localVideoTrackFlow.asStateFlow()

    private val _connectionState = MutableStateFlow(PeerConnection.PeerConnectionState.NEW)
    val connectionState = _connectionState.asStateFlow()

    private var eglBaseContext: EglBase.Context? = null
    private var eglBase: EglBase? = null
    @Volatile private var currentRoomId: String = ""
    private var roomId: String = ""
    private var peerId: String = ""

    /** Lazily-created shared EGL context (thread-safe via singleton use). */
    fun eglContext(context: Context): EglBase.Context {
        if (eglBaseContext == null) {
            val base = EglBase.create()
            eglBase = base
            eglBaseContext = base.eglBaseContext
        }
        return eglBaseContext!!
    }

    fun activeRoomId(): String = currentRoomId

    /**
     * True when a signaling event belongs to this session. Payloads without a
     * roomId (older signaling server) always pass — the generation guard above
     * still covers those.
     */
    private fun isCurrentRoom(data: Any?): Boolean {
        val eventRoomId = (data as? JSONObject)?.optString("roomId").orEmpty()
        if (eventRoomId.isEmpty()) return true
        val mine = currentRoomId
        return mine.isNotEmpty() && eventRoomId == mine
    }

    // Session generation: incremented on every startCall()/endCall(). Async
    // callbacks arriving after teardown capture their gen and bail out if it
    // no longer matches, so stale socket events can't touch a closed session.
    @Volatile private var sessionGen = 0

    // Remote ICE candidates that arrive before the remote description is set.
    private val pendingIceCandidates = mutableListOf<IceCandidate>()
    private var remoteDescriptionSet = false

    // An offer relayed before the peer connection existed (the server puts our
    // socket in the room before handleJoined() finishes building the PC).
    // Dropping it deadlocks the call — buffer it and answer once ready.
    @Volatile private var pendingRemoteOffer: JSONObject? = null

    // createOffer() is async: between calling it and setLocalDescription()
    // completing, signalingState() still reads STABLE. A remote offer landing
    // in that window would be accepted and then clobbered by our own offer.
    @Volatile private var localOfferInFlight = false

    fun init(context: Context, eglContext: EglBase.Context) {
        if (peerConnectionFactory != null) {
            this.eglBaseContext = eglContext
            return
        }
        this.eglBaseContext = eglContext

        // MANDATORY before touching any factory: loads the libwebrtc JNI
        // (libjingle_peerconnection_so.so). Without this the encoder factory
        // crashes with UnsatisfiedLinkError — mediasoup-client used to load
        // the native lib itself, pure WebRTC does not.
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
                .setEnableInternalTracer(false)
                .createInitializationOptions()
        )

        // Audio device module doubles as the recorder tap: every captured mic
        // PCM chunk is handed to the kiosk-side recorder while a call runs.
        val adm = JavaAudioDeviceModule.builder(context.applicationContext)
            .setSamplesReadyCallback(callRecorder)
            .createAudioDeviceModule()

        // Software encoder only: some OEM hardware codecs (e.g. Samsung
        // Exynos OMX.Exynos.VP8.Encoder) fail to create their EGL context on
        // the encoder queue and abort the whole process natively. A single
        // 720p P2P call encodes fine on CPU.
        val videoEncoderFactory = SoftwareVideoEncoderFactory()
        val videoDecoderFactory = DefaultVideoDecoderFactory(eglContext)

        peerConnectionFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(videoEncoderFactory)
            .setVideoDecoderFactory(videoDecoderFactory)
            .setAudioDeviceModule(adm)
            .setOptions(PeerConnectionFactory.Options())
            .createPeerConnectionFactory()

        adm.release()
    }

    fun startCall(roomId: String, context: Context, isVideoCall: Boolean = true) {
        if (peerConnectionFactory == null) return

        sessionGen++
        val gen = sessionGen
        this.roomId = roomId
        this.currentRoomId = roomId
        this.peerId = "kiosk-${System.currentTimeMillis()}"
        remoteDescriptionSet = false
        pendingIceCandidates.clear()
        pendingRemoteOffer = null
        localOfferInFlight = false

        setupLocalMedia(context, isVideoCall)

        signalingJob?.cancel()
        signalingJob = managerScope.launch {
            callRepository.observeSignalingEvents().collect { event ->
                when (event.type) {
                    "joined" -> {
                        val data = event.data as? JSONObject ?: return@collect
                        if (gen != sessionGen) return@collect  // stale event from a torn-down call
                        if (data.optBoolean("success", false)) {
                            handleJoined(gen, data)
                        } else {
                            val code = data.optString("error", data.optString("message"))
                            Logger.e("Join failed: $code")
                            _connectionState.value = PeerConnection.PeerConnectionState.FAILED
                        }
                    }
                    "offer" -> {
                        if (gen != sessionGen) return@collect
                        val data = event.data as? JSONObject ?: return@collect
                        handleRemoteOffer(gen, data.optJSONObject("sdp") ?: return@collect)
                    }
                    "answer" -> {
                        if (gen != sessionGen) return@collect
                        val data = event.data as? JSONObject ?: return@collect
                        handleRemoteAnswer(data.optJSONObject("sdp") ?: return@collect)
                    }
                    "ice-candidate" -> {
                        if (gen != sessionGen) return@collect
                        val data = event.data as? JSONObject ?: return@collect
                        addRemoteCandidate(data.optJSONObject("candidate") ?: return@collect)
                    }
                    "peer-left" -> {
                        if (gen != sessionGen) return@collect
                        if (!isCurrentRoom(event.data)) return@collect
                        Logger.d("Peer left room")
                        _remoteVideoTrack.value = null
                    }
                    "call-ended" -> {
                        if (gen != sessionGen) return@collect
                        // Room-scoped: a hang-up relayed for a previous room
                        // must not tear down this session's media.
                        if (!isCurrentRoom(event.data)) return@collect
                        endCall(context)
                    }
                }
            }
        }

        // Record on the kiosk side for the whole session; upload+verify+delete
        // runs when stopRecordingAndUpload() fires during endCall().
        callRecorder.setCallInfo(roomId)
        callRecorder.startRecording()

        // Optimistic navigation: the POST /calls may still be in flight, and
        // the signaling socket authenticates with the backend-minted token.
        // Wait for it (max 60s) before joining — the family cannot reach the
        // room before OTP anyway, so nothing is lost by waiting here.
        managerScope.launch {
            var waited = 0
            while (gen == sessionGen && AppConfig.signalingToken.isNullOrBlank() && waited < 60_000) {
                delay(250)
                waited += 250
            }
            if (gen != sessionGen) return@launch  // session torn down while waiting
            if (AppConfig.signalingToken.isNullOrBlank()) {
                Logger.e("Signaling token never arrived - cannot join room")
                _connectionState.value = PeerConnection.PeerConnectionState.FAILED
                return@launch
            }
            callRepository.initSignaling()
            callRepository.joinRoom(roomId, peerId)
        }
    }

    private fun handleJoined(gen: Int, joinAck: JSONObject) {
        // A rejoin after a transient socket drop re-delivers "joined" for a
        // session whose connection already exists — skip when fully set up.
        if (gen == sessionGen && peerConnection != null) {
            Logger.d("Joined again for active session - connection already exists, skipping setup")
            return
        }
        try {
            val iceServers = parseIceServers(joinAck.optJSONArray("iceServers"))
            createPeerConnection(iceServers)

            // An offer that raced ahead of the peer connection: answer it now
            // instead of also putting an offer on the table (that would glare).
            if (flushPendingRemoteOffer()) {
                Logger.d("Answered offer that arrived before the connection was ready")
                return
            }

            // Glare-free rule: the party joining an occupied room makes the
            // offer. The party already in the room waits and answers.
            val existingPeers = joinAck.optJSONArray("existingPeers") ?: JSONArray()
            if (existingPeers.length() > 0) {
                makeOffer()
            }
        } catch (e: Exception) {
            Logger.e("Failed to handle joined", e)
            _connectionState.value = PeerConnection.PeerConnectionState.FAILED
        }
    }

    private fun parseIceServers(arr: JSONArray?): List<PeerConnection.IceServer> {
        val servers = mutableListOf<PeerConnection.IceServer>()
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val entry = arr.optJSONObject(i) ?: continue
                val urls = entry.optJSONArray("urls")?.let { a -> List(a.length()) { a.optString(it) } }
                    ?: entry.optString("urls").split(",").map { it.trim() }.filter { it.isNotEmpty() }
                if (urls.isEmpty()) continue
                val builder = PeerConnection.IceServer.builder(urls)
                entry.optString("username", "").takeIf { it.isNotEmpty() }?.let { builder.setUsername(it) }
                entry.optString("credential", "").takeIf { it.isNotEmpty() }?.let { builder.setPassword(it) }
                servers.add(builder.createIceServer())
            }
        }
        return servers
    }

    private fun createPeerConnection(iceServers: List<PeerConnection.IceServer>) {
        val config = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy =
                PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        peerConnection = peerConnectionFactory?.createPeerConnection(
            config,
            object : PeerConnection.Observer {
                override fun onIceCandidate(candidate: IceCandidate) {
                    Logger.d("Local ICE candidate: ${candidate.sdpMid}")
                    val json = JSONObject().apply {
                        put("candidate", candidate.sdp)
                        put("sdpMid", candidate.sdpMid)
                        put("sdpMLineIndex", candidate.sdpMLineIndex)
                    }
                    callRepository.sendIceCandidate(json)
                }

                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}

                override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                    Logger.d("PeerConnection state: $newState")
                    _connectionState.value = newState
                }

                override fun onStandardizedIceConnectionChange(newState: PeerConnection.IceConnectionState) {}

                override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState) {
                    Logger.d("ICE state: $newState")
                }

                override fun onIceConnectionReceivingChange(receiving: Boolean) {}

                override fun onDataChannel(dc: org.webrtc.DataChannel) {}

                override fun onRenegotiationNeeded() {}

                override fun onAddStream(stream: org.webrtc.MediaStream) {}

                override fun onRemoveStream(stream: org.webrtc.MediaStream) {}

                override fun onSignalingChange(state: PeerConnection.SignalingState) {}

                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}

                override fun onTrack(transceiver: org.webrtc.RtpTransceiver) {
                    val track = transceiver.receiver.track() ?: return
                    if (track is VideoTrack) {
                        Logger.d("Remote video track received")
                        _remoteVideoTrack.value = track
                    } else if (track is AudioTrack) {
                        // Remote audio plays automatically through the audio device module.
                        Logger.d("Remote audio track received")
                    }
                }
            }
        )

        // Attach local media to the connection. Both tracks go into ONE stream
        // id ("kiosk-stream"). If they were sent as separate stream ids the
        // family browser's ontrack fires once per stream and its remoteStream
        // gets overwritten with a single track (video), orphaning audio -> the
        // family would see video but hear nothing. A unified stream fixes this
        // at the source so the family holds audio AND video together.
        peerConnection?.let { pc ->
            localVideoTrack?.let { pc.addTrack(it, listOf("kiosk-stream")) }
            localAudioTrack?.let { pc.addTrack(it, listOf("kiosk-stream")) }
        }
    }

    private fun makeOffer() {
        val pc = peerConnection ?: return
        if (pc.signalingState() != PeerConnection.SignalingState.STABLE) {
            Logger.w("makeOffer skipped - signaling state ${pc.signalingState()}")
            return
        }
        localOfferInFlight = true
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }
        pc.createOffer(object : SdpObserverImpl() {
            override fun onCreateSuccess(sdp: SessionDescription) {
                pc.setLocalDescription(object : SdpObserverImpl() {
                    override fun onSetSuccess() {
                        Logger.d("Local SDP offer set")
                    }

                    override fun onSetFailure(error: String?) {
                        localOfferInFlight = false
                        Logger.e("setLocalDescription(offer) failed: $error")
                    }
                }, sdp)
                val payload = JSONObject().apply {
                    put("type", sdp.type.canonicalForm())
                    put("sdp", sdp.description)
                }
                callRepository.sendOffer(payload)
                Logger.d("SDP offer sent")
            }

            override fun onCreateFailure(error: String?) {
                localOfferInFlight = false
                Logger.e("createOffer failed: $error")
            }
        }, constraints)
    }

    private fun handleRemoteOffer(gen: Int, sdpJson: JSONObject) {
        val pc = peerConnection
        if (pc == null) {
            pendingRemoteOffer = sdpJson
            Logger.w("Offer received before connection ready - buffering")
            return
        }
        applyRemoteOffer(pc, sdpJson)
    }

    /** Replays an offer that arrived before the peer connection existed. */
    private fun flushPendingRemoteOffer(): Boolean {
        val sdp = pendingRemoteOffer ?: return false
        pendingRemoteOffer = null
        val pc = peerConnection ?: run {
            pendingRemoteOffer = sdp
            return false
        }
        applyRemoteOffer(pc, sdp)
        return true
    }

    private fun applyRemoteOffer(pc: PeerConnection, sdpJson: JSONObject) {
        // IMPOLITE peer (perfect negotiation): if we already put an offer on
        // the table, ours stands — the family rolls its offer back and answers
        // ours. Accepting theirs too would leave both sides answering a
        // description the other side discarded (double-glare deadlock).
        val state = pc.signalingState()
        if (state != PeerConnection.SignalingState.STABLE || localOfferInFlight) {
            Logger.w("Ignoring remote offer in state $state (offer in flight=$localOfferInFlight) - keeping local offer (glare)")
            return
        }
        val sdp = SessionDescription(
            SessionDescription.Type.fromCanonicalForm(sdpJson.optString("type", "offer")),
            sdpJson.optString("sdp")
        )
        pc.setRemoteDescription(object : SdpObserverImpl() {
            override fun onSetSuccess() {
                remoteDescriptionSet = true
                flushPendingCandidates()
                val constraints = MediaConstraints().apply {
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
                }
                pc.createAnswer(object : SdpObserverImpl() {
                    override fun onCreateSuccess(answer: SessionDescription) {
                        pc.setLocalDescription(SdpObserverImpl(), answer)
                        val payload = JSONObject().apply {
                            put("type", answer.type.canonicalForm())
                            put("sdp", answer.description)
                        }
                        callRepository.sendAnswer(payload)
                        Logger.d("SDP answer sent")
                    }

                    override fun onCreateFailure(error: String?) {
                        Logger.e("createAnswer failed: $error")
                    }
                }, constraints)
            }

            override fun onSetFailure(error: String?) {
                Logger.e("setRemoteDescription(offer) failed: $error")
            }
        }, sdp)
    }

    private fun handleRemoteAnswer(sdpJson: JSONObject) {
        val pc = peerConnection ?: return
        val sdp = SessionDescription(
            SessionDescription.Type.fromCanonicalForm(sdpJson.optString("type", "answer")),
            sdpJson.optString("sdp")
        )
        pc.setRemoteDescription(object : SdpObserverImpl() {
            override fun onSetSuccess() {
                remoteDescriptionSet = true
                flushPendingCandidates()
                Logger.d("Remote SDP answer set successfully")
            }

            override fun onSetFailure(error: String?) {
                Logger.e("setRemoteDescription(answer) failed: $error")
            }
        }, sdp)
    }

    private fun addRemoteCandidate(candidateJson: JSONObject) {
        val candidate = IceCandidate(
            candidateJson.optString("sdpMid"),
            candidateJson.optInt("sdpMLineIndex"),
            candidateJson.optString("candidate")
        )
        if (!remoteDescriptionSet) {
            pendingIceCandidates.add(candidate)
            Logger.d("Buffering remote ICE candidate until remote description is set")
            return
        }
        peerConnection?.addIceCandidate(candidate)
        Logger.d("Added remote ICE candidate")
    }

    private fun flushPendingCandidates() {
        val pending = pendingIceCandidates.toList()
        pendingIceCandidates.clear()
        pending.forEach { peerConnection?.addIceCandidate(it) }
    }

    /** Minimal no-op base so observers only override what they need. */
    private open class SdpObserverImpl : SdpObserver {
        override fun onCreateSuccess(sdp: SessionDescription) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(error: String?) {}
        override fun onSetFailure(error: String?) {}
    }

    private fun setupLocalMedia(context: Context, isVideoCall: Boolean) {
        if (isVideoCall) {
            surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBaseContext)
            videoCapturer = createVideoCapturer(context)

            localVideoSource = peerConnectionFactory?.createVideoSource(false)
            videoCapturer?.initialize(surfaceTextureHelper, context, localVideoSource?.capturerObserver)
            videoCapturer?.startCapture(1280, 720, 30)

            localVideoTrack = peerConnectionFactory?.createVideoTrack("ARDMSv0", localVideoSource)
            _localVideoTrackFlow.value = localVideoTrack
        }

        val audioConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googHighpassFilter", "true"))
        }
        localAudioSource = peerConnectionFactory?.createAudioSource(audioConstraints)
        localAudioTrack = peerConnectionFactory?.createAudioTrack("ARDAMs0", localAudioSource)
    }

    private fun createVideoCapturer(context: Context): VideoCapturer? {
        val enumerator = Camera2Enumerator(context)

        for (deviceName in enumerator.deviceNames) {
            if (enumerator.isFrontFacing(deviceName)) {
                return enumerator.createCapturer(deviceName, null)
            }
        }
        for (deviceName in enumerator.deviceNames) {
            if (!enumerator.isFrontFacing(deviceName)) {
                return enumerator.createCapturer(deviceName, null)
            }
        }
        return null
    }

    fun switchCamera() {
        if (videoCapturer is CameraVideoCapturer) {
            (videoCapturer as CameraVideoCapturer).switchCamera(null)
        }
    }

    /** Diagnostics for one-way-audio complaints: mic track state + sender stats. */
    fun logAudioHealth() {
        val track = localAudioTrack
        Logger.d(
            "AudioHealth: localMic=${if (track == null) "MISSING" else "enabled=${track.enabled()} state=${track.state()}"}"
        )
        peerConnection?.senders?.forEach { sender ->
            val t = sender.track()
            Logger.d("AudioHealth: sender kind=${t?.kind()} enabled=${t?.enabled()} state=${t?.state()}")
        }
    }

    fun toggleVideo(enabled: Boolean) {
        localVideoTrack?.setEnabled(enabled)
    }

    fun toggleAudio(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }

    @Suppress("DEPRECATION")
    fun setSpeakerphoneOn(context: Context, on: Boolean) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = on
    }

    fun endCall(context: Context? = null) {
        // Invalidate every in-flight async callback for this session.
        sessionGen++

        // Only notify the signaling server when a real session existed.
        // initCall() defensively calls endCall() BEFORE startCall() — leaveRoom()
        // would then wipe AppConfig.signalingToken, so the fresh socket falls
        // back to the login token (role 'inmate') and join-room gets FORBIDDEN.
        val hadRealSession = roomId.isNotEmpty() && peerConnection != null

        // Stop + upload + verify + delete happens asynchronously; the UI can
        // tear down immediately.
        callRecorder.stopRecordingAndUpload()

        if (hadRealSession) {
            // Tell the other peer FIRST so it ends instantly too, then leave.
            callRepository.sendCallEnded()
            callRepository.leaveRoom(roomId, peerId)
        }
        signalingJob?.cancel()
        signalingJob = null

        peerConnection?.close()
        peerConnection = null

        videoCapturer?.let { capturer ->
            try {
                capturer.stopCapture()
            } catch (_: Exception) {}
            capturer.dispose()
        }
        videoCapturer = null

        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null

        localVideoTrack?.dispose()
        localVideoTrack = null
        localAudioTrack?.dispose()
        localAudioTrack = null
        localVideoSource?.dispose()
        localVideoSource = null
        localAudioSource?.dispose()
        localAudioSource = null

        _remoteVideoTrack.value = null
        _localVideoTrackFlow.value = null
        _connectionState.value = PeerConnection.PeerConnectionState.CLOSED
        pendingIceCandidates.clear()
        remoteDescriptionSet = false
        pendingRemoteOffer = null
        localOfferInFlight = false
        roomId = ""
        currentRoomId = ""
        peerId = ""
    }

    // ---- Live call quality, read straight from libwebrtc's stats ----

    /** Bitrate is a rate, so it needs the previous sample to diff against. */
    @Volatile private var lastInboundBytes: Long = -1L
    @Volatile private var lastStatsUs: Double = 0.0

    suspend fun getQualitySnapshot(): QualitySnapshot = suspendCancellableCoroutine { cont ->
        val pc = peerConnection
        if (pc == null) {
            cont.resumeWith(Result.success(QualitySnapshot("poor", 0.0, 0.0, 0.0)))
            return@suspendCancellableCoroutine
        }
        val delivered = AtomicBoolean(false)
        try {
            pc.getStats(object : RTCStatsCollectorCallback {
                override fun onStatsDelivered(report: RTCStatsReport) {
                    if (!delivered.compareAndSet(false, true)) return
                    cont.resumeWith(Result.success(computeQuality(report)))
                }
            })
        } catch (e: Throwable) {
            Logger.w("getStats failed: ${e.message}")
            if (delivered.compareAndSet(false, true)) {
                cont.resumeWith(Result.success(QualitySnapshot("unknown", 0.0, 0.0, 0.0)))
            }
        }
    }

    /** "excellent" | "good" | "fair" | "poor" — see [QualitySnapshot]. */
    suspend fun getConnectionQuality(): String = getQualitySnapshot().quality

    private fun computeQuality(report: RTCStatsReport): QualitySnapshot {
        var inbound: Map<String, Any> = emptyMap()
        var inboundKind = ""
        var nominatedRttMs = 0.0
        var anyRttMs = 0.0

        for (stats in report.statsMap.values) {
            val members: Map<String, Any> = stats.members ?: continue
            when (stats.type) {
                "inbound-rtp" -> {
                    val kind = statStr(members, "kind") ?: statStr(members, "mediaType") ?: ""
                    // Prefer the video stream; fall back to audio.
                    if (inbound.isEmpty() || (kind == "video" && inboundKind != "video")) {
                        inbound = members
                        inboundKind = kind
                    }
                }
                "candidate-pair" -> {
                    if (statStr(members, "state") != "succeeded") continue
                    val rttMs = statNum(members, "currentRoundTripTime") * 1000.0
                    if (rttMs <= 0.0) continue
                    if (anyRttMs == 0.0) anyRttMs = rttMs
                    if (statBool(members, "nominated")) nominatedRttMs = rttMs
                }
            }
        }
        val rttMs = if (nominatedRttMs > 0.0) nominatedRttMs else anyRttMs

        val received = statNum(inbound, "packetsReceived").toLong()
        val lost = statNum(inbound, "packetsLost").toLong()
        val jitterMs = statNum(inbound, "jitter") * 1000.0
        val bytes = statNum(inbound, "bytesReceived").toLong()

        val total = received + lost
        val lossPct = if (total > 0) lost * 100.0 / total else 0.0

        // kbps = deltaBits * 1000 / deltaMicros
        val nowUs = report.timestampUs
        var bitrateKbps = 0.0
        if (lastInboundBytes >= 0 && lastStatsUs > 0 && nowUs > lastStatsUs && bytes >= lastInboundBytes) {
            bitrateKbps = (bytes - lastInboundBytes) * 8.0 * 1000.0 / (nowUs - lastStatsUs)
        }
        lastInboundBytes = bytes
        lastStatsUs = nowUs

        val state = peerConnection?.connectionState()
        val quality = when {
            state == PeerConnection.PeerConnectionState.FAILED ||
                state == PeerConnection.PeerConnectionState.CLOSED -> "poor"
            inbound.isEmpty() -> "good"
            lossPct > 15 || rttMs > 500 || jitterMs > 100 -> "poor"
            lossPct > 5 || rttMs > 250 || jitterMs > 50 -> "fair"
            lossPct > 1 || rttMs > 150 -> "good"
            else -> "excellent"
        }
        return QualitySnapshot(quality, round2(lossPct), round1(jitterMs), round1(bitrateKbps))
    }

    private fun statNum(m: Map<String, Any>, key: String): Double =
        (m[key] as? Number)?.toDouble() ?: 0.0

    private fun statStr(m: Map<String, Any>, key: String): String? = m[key] as? String

    private fun statBool(m: Map<String, Any>, key: String): Boolean = m[key] as? Boolean ?: false

    private fun round1(v: Double): Double = Math.round(v * 10.0) / 10.0

    private fun round2(v: Double): Double = Math.round(v * 100.0) / 100.0
}

/** One sample of live call quality read straight from libwebrtc's stats. */
data class QualitySnapshot(
    /** "excellent" | "good" | "fair" | "poor" | "unknown" */
    val quality: String,
    /** Inbound packet loss, percent (0..100). */
    val packetLoss: Double,
    /** Inbound jitter, milliseconds. */
    val jitter: Double,
    /** Current inbound bitrate, kbps. */
    val bitrate: Double,
)
