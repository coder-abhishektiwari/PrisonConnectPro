package com.prisonconnect.kiosk.ui.call

import android.content.Context
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.repository.CallRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.mediasoup.droid.Consumer
import org.mediasoup.droid.Device
import org.mediasoup.droid.MediasoupClient
import org.mediasoup.droid.Producer
import org.mediasoup.droid.Transport
import org.mediasoup.droid.RecvTransport
import org.mediasoup.droid.SendTransport
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.webrtc.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WebRtcManager @Inject constructor(
    private val callRepository: CallRepository
) {
    private val managerScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // Mediasoup components
    private var device: Device? = null
    private var sendTransport: SendTransport? = null
    private var recvTransport: RecvTransport? = null
    private var videoProducer: Producer? = null
    private var audioProducer: Producer? = null
    private var videoConsumer: Consumer? = null
    private var audioConsumer: Consumer? = null

    // WebRTC media components (used by Mediasoup internally)
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

    // Transport listeners
    private val sendTransportListener = object : SendTransport.Listener {
        override fun onConnect(transport: Transport, dtlsParameters: String) {
            Logger.d("SendTransport onConnect")
            callRepository.connectWebRtcTransport(peerId, "send", dtlsParameters)
        }

        override fun onConnectionStateChange(transport: Transport, connectionState: String) {
            Logger.d("SendTransport state: $connectionState")
            when (connectionState) {
                "connected" -> _connectionState.value = PeerConnection.PeerConnectionState.CONNECTED
                "connecting" -> _connectionState.value = PeerConnection.PeerConnectionState.CONNECTING
                "disconnected" -> _connectionState.value = PeerConnection.PeerConnectionState.DISCONNECTED
                "failed" -> _connectionState.value = PeerConnection.PeerConnectionState.FAILED
                "closed" -> _connectionState.value = PeerConnection.PeerConnectionState.CLOSED
            }
        }

        override fun onProduce(transport: Transport, kind: String, rtpParameters: String, appData: String): String {
            var producerId = ""
            val latch = CountDownLatch(1)
            callRepository.produce(peerId, kind, rtpParameters) { response ->
                val data = response as? JSONObject
                producerId = data?.optString("id") ?: ""
                latch.countDown()
            }
            try {
                latch.await(5, TimeUnit.SECONDS)
            } catch (e: Exception) {
                Logger.e("Produce timeout", e)
            }
            return producerId
        }

        override fun onProduceData(transport: Transport, s1: String, s2: String, s3: String, s4: String): String {
            return ""
        }
    }

    private val recvTransportListener = object : RecvTransport.Listener {
        override fun onConnect(transport: Transport, dtlsParameters: String) {
            Logger.d("RecvTransport onConnect")
            callRepository.connectWebRtcTransport(peerId, "recv", dtlsParameters)
        }

        override fun onConnectionStateChange(transport: Transport, connectionState: String) {
            Logger.d("RecvTransport state: $connectionState")
        }
    }

    private val producerListener = object : Producer.Listener {
        override fun onTransportClose(producer: Producer) {
            Logger.d("Producer closed: ${producer.id}")
        }
    }

    private val consumerListener = object : Consumer.Listener {
        override fun onTransportClose(consumer: Consumer) {
            Logger.d("Consumer closed: ${consumer.id}")
        }
    }

    fun init(context: Context, eglContext: EglBase.Context) {
        if (peerConnectionFactory != null) {
            this.eglBaseContext = eglContext
            return
        }
        this.eglBaseContext = eglContext
        MediasoupClient.initialize(context)

        val videoEncoderFactory = DefaultVideoEncoderFactory(eglContext, true, true)
        val videoDecoderFactory = DefaultVideoDecoderFactory(eglContext)

        peerConnectionFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(videoEncoderFactory)
            .setVideoDecoderFactory(videoDecoderFactory)
            .setOptions(PeerConnectionFactory.Options())
            .createPeerConnectionFactory()
    }

    fun startCall(roomId: String, context: Context, isVideoCall: Boolean = true) {
        if (peerConnectionFactory == null) return

        this.roomId = roomId
        this.peerId = "kiosk-${System.currentTimeMillis()}"

        // Set up Local Media Tracks
        setupLocalMedia(context, isVideoCall)

        managerScope.launch {
            callRepository.observeSignalingEvents().collect { event ->
                when (event.type) {
                    "joined" -> {
                        val data = event.data as JSONObject
                        if (data.optBoolean("success", false)) {
                            val routerRtpCapabilities = data.getString("routerRtpCapabilities")
                            handleJoined(routerRtpCapabilities)
                        } else {
                            Logger.e("Join failed: ${data.optString("message")}")
                            _connectionState.value = PeerConnection.PeerConnectionState.FAILED
                        }
                    }
                    "peer-joined" -> {
                        Logger.d("Peer joined room")
                    }
                    "new-producer" -> {
                        val data = event.data as JSONObject
                        val producerId = data.getString("producerId")
                        Logger.d("New producer: $producerId")
                        consumeRemoteTrack(producerId)
                    }
                    "peer-left" -> {
                        Logger.d("Peer left room")
                        _remoteVideoTrack.value = null
                    }
                    "call-ended" -> {
                        endCall()
                    }
                }
            }
        }

        callRepository.initSignaling()
        callRepository.joinRoom(roomId, peerId)
    }

    private fun handleJoined(routerRtpCapabilities: String) {
        try {
            // Create Device
            device = Device()
            device?.load(routerRtpCapabilities, null)

            // Create Send Transport
            callRepository.createWebRtcTransport(roomId, peerId, "send") { transportData ->
                val data = transportData as JSONObject
                if (data.optBoolean("success", false)) {
                    val transportInfo = data.getJSONObject("data")
                    createSendTransport(transportInfo)
                } else {
                    Logger.e("Send transport creation failed: ${data.optString("message")}")
                }
            }

            // Create Recv Transport
            callRepository.createWebRtcTransport(roomId, peerId, "recv") { transportData ->
                val data = transportData as JSONObject
                if (data.optBoolean("success", false)) {
                    val transportInfo = data.getJSONObject("data")
                    createRecvTransport(transportInfo)
                } else {
                    Logger.e("Recv transport creation failed: ${data.optString("message")}")
                }
            }
        } catch (e: Exception) {
            Logger.e("Failed to handle joined", e)
            _connectionState.value = PeerConnection.PeerConnectionState.FAILED
        }
    }

    private fun createSendTransport(transportInfo: JSONObject) {
        try {
            val id = transportInfo.getString("id")
            val iceParameters = transportInfo.getJSONObject("iceParameters").toString()
            val iceCandidates = transportInfo.getJSONArray("iceCandidates").toString()
            val dtlsParameters = transportInfo.getJSONObject("dtlsParameters").toString()

            sendTransport = device?.createSendTransport(
                sendTransportListener,
                id,
                iceParameters,
                iceCandidates,
                dtlsParameters,
                null
            )

            // Produce video if available
            localVideoTrack?.let { track ->
                videoProducer = sendTransport?.produce(
                    producerListener,
                    track,
                    null,
                    null,
                    null,
                    null
                )
            }

            // Produce audio
            localAudioTrack?.let { track ->
                audioProducer = sendTransport?.produce(
                    producerListener,
                    track,
                    null,
                    null,
                    null,
                    null
                )
            }
        } catch (e: Exception) {
            Logger.e("Failed to create send transport", e)
        }
    }

    private fun createRecvTransport(transportInfo: JSONObject) {
        try {
            val id = transportInfo.getString("id")
            val iceParameters = transportInfo.getJSONObject("iceParameters").toString()
            val iceCandidates = transportInfo.getJSONArray("iceCandidates").toString()
            val dtlsParameters = transportInfo.getJSONObject("dtlsParameters").toString()

            recvTransport = device?.createRecvTransport(
                recvTransportListener,
                id,
                iceParameters,
                iceCandidates,
                dtlsParameters,
                null
            )
        } catch (e: Exception) {
            Logger.e("Failed to create recv transport", e)
        }
    }

    private fun consumeRemoteTrack(producerId: String) {
        try {
            val rtpCapabilities = device?.rtpCapabilities ?: return
            callRepository.consume(peerId, producerId, rtpCapabilities) { consumerData ->
                val data = consumerData as JSONObject
                if (data.optBoolean("success", false)) {
                    val consumerId = data.getString("id")
                    val kind = data.getString("kind")
                    val rtpParameters = data.getJSONObject("rtpParameters").toString()

                    val consumer = recvTransport?.consume(
                        consumerListener,
                        consumerId,
                        producerId,
                        kind,
                        rtpParameters,
                        null
                    )

                    if (consumer != null) {
                        if (kind == "video") {
                            videoConsumer = consumer
                            val track = consumer.track
                            if (track is VideoTrack) {
                                _remoteVideoTrack.value = track
                            }
                        } else {
                            audioConsumer = consumer
                        }

                        // Resume consumer
                        callRepository.resumeConsumer(peerId, consumerId)
                    }
                }
            }
        } catch (e: Exception) {
            Logger.e("Failed to consume remote track", e)
        }
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
        val deviceNames = enumerator.deviceNames

        // First, try to find front facing camera
        for (deviceName in deviceNames) {
            if (enumerator.isFrontFacing(deviceName)) {
                return enumerator.createCapturer(deviceName, null)
            }
        }

        // Otherwise, use the first available camera
        for (deviceName in deviceNames) {
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

    fun setSpeakerphoneOn(context: Context, on: Boolean) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
        audioManager.mode = android.media.AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = on
    }

    fun endCall() {
        callRepository.leaveRoom(roomId, peerId)

        // Close producers
        videoProducer?.close()
        videoProducer = null
        audioProducer?.close()
        audioProducer = null

        // Close consumers
        videoConsumer?.close()
        videoConsumer = null
        audioConsumer?.close()
        audioConsumer = null

        // Close transports
        sendTransport?.close()
        sendTransport = null
        recvTransport?.close()
        recvTransport = null

        // Close device
        device = null

        // Clean up media
        videoCapturer?.stopCapture()
        videoCapturer?.dispose()
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
    }
}
