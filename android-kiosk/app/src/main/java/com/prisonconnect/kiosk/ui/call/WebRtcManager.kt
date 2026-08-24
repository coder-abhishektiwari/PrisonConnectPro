package com.prisonconnect.kiosk.ui.call

import android.content.Context
import android.media.AudioManager
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.repository.CallRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule
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
    private var roomId: String = ""
    private var peerId: String = ""

    // Session generation: incremented on every startCall()/endCall(). Async
    // callbacks arriving after teardown capture their gen and bail out if it
    // no longer matches, so stale socket events can't touch a closed session.
    @Volatile private var sessionGen = 0

    // Remote ICE candidates that arrive before the remote description is set.
    private val pendingIceCandidates = mutableListOf<IceCandidate>()
    private var remoteDescriptionSet = false

    fun init(context: Context, eglContext: EglBase.Context) {
        if (peerConnectionFactory != null) {
            this.eglBaseContext = eglContext
            return
        }
        this.eglBaseContext = eglContext

        // Audio device module doubles as the recorder tap: every captured mic
        // PCM chunk is handed to the kiosk-side recorder while a call runs.
        val adm = JavaAudioDeviceModule.builder(context.applicationContext)
            .setSamplesReadyCallback(callRecorder)
            .createAudioDeviceModule()

        val videoEncoderFactory = DefaultVideoEncoderFactory(eglContext, true, true)
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
        this.peerId = "kiosk-${System.currentTimeMillis()}"
        remoteDescriptionSet = false
        pendingIceCandidates.clear()

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
                        Logger.d("Peer left room")
                        _remoteVideoTrack.value = null
                    }
                    "call-ended" -> {
                        endCall(context)
                    }
                }
            }
        }

        // Record on the kiosk side for the whole session; upload+verify+delete
        // runs when stopRecordingAndUpload() fires during endCall().
        callRecorder.setCallInfo(roomId)
        callRecorder.startRecording()

        callRepository.initSignaling()
        callRepository.joinRoom(roomId, peerId)
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

        // Attach local media to the connection.
        peerConnection?.let { pc ->
            localVideoTrack?.let { pc.addTrack(it, listOf("kiosk-video")) }
            localAudioTrack?.let { pc.addTrack(it, listOf("kiosk-audio")) }
        }
    }

    private fun makeOffer() {
        val pc = peerConnection ?: return
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }
        pc.createOffer(object : SdpObserverImpl() {
            override fun onCreateSuccess(sdp: SessionDescription) {
                pc.setLocalDescription(SdpObserverImpl(), sdp)
                val payload = JSONObject().apply {
                    put("type", sdp.type.canonicalForm())
                    put("sdp", sdp.description)
                }
                callRepository.sendOffer(payload)
                Logger.d("SDP offer sent")
            }

            override fun onCreateFailure(error: String?) {
                Logger.e("createOffer failed: $error")
            }
        }, constraints)
    }

    private fun handleRemoteOffer(gen: Int, sdpJson: JSONObject) {
        val pc = peerConnection ?: run {
            Logger.w("Offer received before connection ready - ignoring")
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
        roomId = ""
        peerId = ""
    }
}
