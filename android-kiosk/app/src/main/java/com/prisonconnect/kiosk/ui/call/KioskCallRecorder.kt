package com.prisonconnect.kiosk.ui.call

import android.content.Context
import android.location.LocationManager
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.upload.RecordingUploadWorker
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.webrtc.EglBase
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule
import java.io.File
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.LockSupport
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kiosk-side, BOTH-sides call recording.
 *
 * Audio: the WebRTC audio device module taps the kiosk microphone AND the
 * family's playout, [StereoStitcher] merges them into one stereo stream
 * (left = kiosk, right = family) and a single AAC encoder writes it.
 *
 * Video: [VideoComposer] composites the kiosk camera over the family's video
 * straight onto a hardware H.264 encoder's input surface.
 *
 * Both tracks land in one MP4 under `Android/data/.../files/Recordings`, with
 * the kiosk's last known coordinates in the container metadata. On call end
 * the file is finalised and then uploaded (kept locally until the server
 * acknowledges it).
 */
@Singleton
class KioskCallRecorder @Inject constructor(
    @ApplicationContext private val appContext: Context
) : JavaAudioDeviceModule.SamplesReadyCallback,
    JavaAudioDeviceModule.PlaybackSamplesReadyCallback {

    private val running = AtomicBoolean(false)

    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording.asStateFlow()

    // Audio side: stitcher feeds the PCM queue, the worker drains it.
    @Volatile private var stitcher: StereoStitcher? = null
    @Volatile private var pcmQueue: ArrayBlockingQueue<ByteArray>? = null
    @Volatile private var worker: Thread? = null
    @Volatile private var pacer: Thread? = null
    @Volatile private var sessionStartNs = 0L

    // Video side: encoder + composition thread.
    @Volatile private var encoder: RecordingVideoEncoder? = null
    @Volatile private var composer: VideoComposer? = null
    @Volatile private var muxer: RecordingMuxer? = null
    @Volatile private var outputFile: File? = null

    private var localTrack: VideoTrack? = null
    private var remoteTrack: VideoTrack? = null
    private var profile: RecordingProfile = RecordingProfile.current

    private val localSink = object : VideoSink {
        override fun onFrame(frame: VideoFrame) {
            if (loggedLocalFrame.compareAndSet(false, true)) {
                Logger.d("Recorder: first local camera frame reached recorder")
            }
            composer?.onLocalFrame(frame)
        }
    }

    private val remoteSink = object : VideoSink {
        override fun onFrame(frame: VideoFrame) {
            if (loggedRemoteFrame.compareAndSet(false, true)) {
                Logger.d("Recorder: first remote (family) frame reached recorder")
            }
            composer?.onRemoteFrame(frame)
        }
    }

    private val loggedLocalFrame = java.util.concurrent.atomic.AtomicBoolean(false)
    private val loggedRemoteFrame = java.util.concurrent.atomic.AtomicBoolean(false)

    /** Identifier recorded into the uploaded file metadata. roomId doubles as
     *  callId — the backend resolves calls by callId OR roomId. */
    @Volatile private var currentCallId = ""

    fun setCallInfo(roomId: String) {
        currentCallId = roomId
    }

    // ---- WebRTC audio taps (different threads: record / playout) ----

    /** Kiosk microphone chunk. */
    override fun onWebRtcAudioRecordSamplesReady(samples: JavaAudioDeviceModule.AudioSamples) {
        stitcher?.pushMic(samples)
    }

    /** Family-side playout chunk — this is the other half of the recording. */
    override fun onWebRtcAudioTrackSamplesReady(samples: JavaAudioDeviceModule.AudioSamples) {
        stitcher?.pushPlayback(samples)
    }

    /**
     * Wall-clock emission of 10 ms stereo frames. Driving the queue from a
     * timer instead of the microphone keeps the file's timeline honest:
     * while the mic tap is dead (pre-connect, or the user mutes mid-call)
     * the stitcher still yields frames of silence, so audio never loses
     * time against the video track. A backlog above [CATCHUP_BACKLOG_MS]
     * skips the sleep so queued input drains at real-time speed.
     */
    private fun audioPacer(st: StereoStitcher, queue: ArrayBlockingQueue<ByteArray>) {
        var next = System.nanoTime()
        while (running.get()) {
            queue.offer(st.poll())
            next += PACER_INTERVAL_NS
            val now = System.nanoTime()
            val backlog = st.backlogMs()
            when {
                backlog > CATCHUP_BACKLOG_MS -> next = now
                next > now -> LockSupport.parkNanos(next - now)
                now - next > PACER_INTERVAL_NS -> next = now
            }
        }
    }

    // ---- video track wiring (called from WebRtcManager) ----

    @Synchronized
    fun setLocalVideoTrack(track: VideoTrack?) {
        if (track === localTrack) return
        try { localTrack?.removeSink(localSink) } catch (_: Throwable) {}
        localTrack = track
        try { track?.addSink(localSink) } catch (e: Throwable) {
            Logger.w("Recorder: local video sink attach failed: ${e.message}")
        }
        Logger.d("Recorder: local sink track=${track?.let { System.identityHashCode(it) }}")
    }

    @Synchronized
    fun setRemoteVideoTrack(track: VideoTrack?) {
        if (track === remoteTrack) return
        try { remoteTrack?.removeSink(remoteSink) } catch (_: Throwable) {}
        remoteTrack = track
        try { track?.addSink(remoteSink) } catch (e: Throwable) {
            Logger.w("Recorder: remote video sink attach failed: ${e.message}")
        }
        Logger.d("Recorder: remote sink track=${track?.let { System.identityHashCode(it) }}")
    }

    // ---- session lifecycle ----

    @Synchronized
    fun startRecording(eglContext: EglBase.Context?, recordVideo: Boolean = true) {
        if (running.getAndSet(true)) return
        profile = RecordingProfile.current
        _isRecording.value = true
        loggedLocalFrame.set(false)
        loggedRemoteFrame.set(false)

        val st = StereoStitcher().also { it.reset() }
        stitcher = st
        val startNs = System.nanoTime()
        sessionStartNs = startNs

        val dir = appContext.getExternalFilesDir("Recordings")
            ?: File(appContext.filesDir, "Recordings")
        if (!dir.exists()) dir.mkdirs()
        val file = File(
            dir,
            "rec-${currentCallId.ifEmpty { "unknown" }}-${System.currentTimeMillis()}.mp4"
        )
        outputFile = file

        val wantVideo = recordVideo && eglContext != null
        val location = lastKnownLocation()
        val newMuxer = RecordingMuxer(file, if (wantVideo) 2 else 1, location, startNs)
        muxer = newMuxer

        // Audio first: its format is fixed (48 kHz stereo AAC), so it can start
        // feeding the muxer immediately and gets buffered until video is in.
        val queue = ArrayBlockingQueue<ByteArray>(AUDIO_QUEUE_FRAMES)
        pcmQueue = queue
        worker = Thread(
            { audioLoop(queue, newMuxer) },
            "kiosk-call-recorder"
        ).apply { start() }
        pacer = Thread({ audioPacer(st, queue) }, "kiosk-rec-audio-pacer").apply {
            isDaemon = true
            start()
        }

        if (wantVideo) {
            val enc = RecordingVideoEncoder(
                muxer = newMuxer,
                width = profile.width,
                height = profile.height,
                fps = profile.fps,
                bitrate = profile.videoBitrate,
                sharedEglContext = eglContext
            )
            if (enc.start()) {
                encoder = enc
                val comp = VideoComposer(enc, profile, startNs)
                if (comp.start()) {
                    composer = comp
                } else {
                    Logger.e("Recorder: composer failed - falling back to audio-only")
                    newMuxer.completeTrackList()
                    runCatching { enc.stop() }
                    encoder = null
                }
            } else {
                Logger.e("Recorder: video encoder failed - falling back to audio-only")
                newMuxer.completeTrackList()
                encoder = null
            }
        }

        Logger.i(
            "Recording started profile=${profile.name} ${profile.width}x${profile.height}@${profile.fps} " +
                "video=${encoder != null} file=${file.name} location=${location != null}"
        )
    }

    @Synchronized
    fun stopRecordingAndUpload() {
        if (!running.getAndSet(false)) return
        _isRecording.value = false
        stitcher = null
        pcmQueue = null

        composer?.stop()
        composer = null
        encoder?.stop()
        encoder = null

        try {
            pacer?.join(2_000)
        } catch (_: InterruptedException) {}
        pacer = null

        try {
            worker?.join(10_000)
        } catch (_: InterruptedException) {}
        worker = null

        val file = outputFile
        outputFile = null
        val sessionMuxer = muxer
        muxer = null
        sessionMuxer?.finish()

        val path = file?.absolutePath ?: ""
        val size = file?.length() ?: 0L
        Logger.i("Recording finalized size=$size path=$path")
        if (file != null && size > 0) {
            // WorkManager takes over: registers the metadata with the backend
            // (dashboard row appears) and then encrypts the master in place.
            // The file itself stays on the device until a warden retrieves it.
            val durationSeconds = if (sessionStartNs > 0) {
                ((System.nanoTime() - sessionStartNs) / 1_000_000_000L).toInt().coerceAtLeast(1)
            } else null
            RecordingUploadWorker.enqueueRegister(appContext, file, currentCallId, durationSeconds)
        }
    }

    // ---- audio encode loop ----

    /**
     * Drains the stitched stereo PCM into an AAC encoder and the shared muxer.
     * Runs for one session; the caller stops it by flipping [running] and
     * clearing the queue, then joining.
     */
    private fun audioLoop(queue: ArrayBlockingQueue<ByteArray>, sessionMuxer: RecordingMuxer) {
        var codec: MediaCodec? = null
        var trackIndex = -1
        var totalPcmBytes = 0L

        try {
            val format = MediaFormat.createAudioFormat(
                MediaFormat.MIMETYPE_AUDIO_AAC,
                StereoStitcher.TARGET_RATE,
                StereoStitcher.CHANNELS
            ).apply {
                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                setInteger(MediaFormat.KEY_BIT_RATE, profile.audioBitrate)
                setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 32_768)
            }
            val audioCodec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
            audioCodec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            audioCodec.start()
            codec = audioCodec

            val info = MediaCodec.BufferInfo()
            while (running.get() || !queue.isEmpty()) {
                val chunk = queue.poll(200, TimeUnit.MILLISECONDS) ?: continue

                val inIdx = audioCodec.dequeueInputBuffer(10_000)
                if (inIdx >= 0) {
                    val input = audioCodec.getInputBuffer(inIdx)!!
                    input.clear()
                    val size = minOf(chunk.size, input.capacity())
                    input.put(chunk, 0, size)
                    audioCodec.queueInputBuffer(inIdx, 0, size, pcmPtsUs(totalPcmBytes), 0)
                    totalPcmBytes += size
                }

                while (true) {
                    val outIdx = audioCodec.dequeueOutputBuffer(info, 0)
                    if (outIdx == MediaCodec.INFO_TRY_AGAIN_LATER) break
                    if (outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        trackIndex = sessionMuxer.registerTrack(audioCodec.outputFormat) ?: -1
                        if (trackIndex < 0) Logger.w("Recorder: muxer rejected audio track")
                        continue
                    }
                    if (outIdx == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) continue
                    if (outIdx < 0) continue
                    writeIfData(audioCodec, outIdx, info, sessionMuxer, trackIndex)
                }
            }

            // Session stopped: EOS, then drain until the encoder hands it back.
            val bufferInfo = MediaCodec.BufferInfo()
            var eosSent = false
            repeat(10) {
                if (eosSent) return@repeat
                val inIdx = audioCodec.dequeueInputBuffer(10_000)
                if (inIdx >= 0) {
                    audioCodec.queueInputBuffer(
                        inIdx, 0, 0, pcmPtsUs(totalPcmBytes),
                        MediaCodec.BUFFER_FLAG_END_OF_STREAM
                    )
                    eosSent = true
                }
            }
            val deadline = System.currentTimeMillis() + 2_000
            while (eosSent && System.currentTimeMillis() < deadline) {
                val outIdx = audioCodec.dequeueOutputBuffer(bufferInfo, 10_000)
                if (outIdx == MediaCodec.INFO_TRY_AGAIN_LATER) continue
                if (outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    if (trackIndex < 0) {
                        trackIndex = sessionMuxer.registerTrack(audioCodec.outputFormat) ?: -1
                    }
                    continue
                }
                if (outIdx == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) continue
                if (outIdx < 0) continue
                val eos = bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                writeIfData(audioCodec, outIdx, bufferInfo, sessionMuxer, trackIndex)
                if (eos) break
            }
        } catch (e: Exception) {
            Logger.e("Recorder: audio encode failed", e)
        } finally {
            try { codec?.stop() } catch (_: Throwable) {}
            try { codec?.release() } catch (_: Throwable) {}
        }
    }

    /** PTS in microseconds, counted from the first stitched sample. */
    private fun pcmPtsUs(totalPcmBytes: Long): Long =
        totalPcmBytes * 1_000_000L /
            (StereoStitcher.TARGET_RATE.toLong() * StereoStitcher.CHANNELS * 2)

    private fun writeIfData(
        codec: MediaCodec,
        index: Int,
        info: MediaCodec.BufferInfo,
        sessionMuxer: RecordingMuxer,
        trackIndex: Int
    ) {
        try {
            if (info.size > 0 && trackIndex >= 0 &&
                info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0
            ) {
                val buffer = codec.getOutputBuffer(index)
                if (buffer != null) {
                    buffer.position(info.offset)
                    buffer.limit(info.offset + info.size)
                    sessionMuxer.write(trackIndex, buffer, info)
                }
            }
        } finally {
            codec.releaseOutputBuffer(index, false)
        }
    }

    // ---- helpers ----

    /** Last known position, recorded into the MP4 container metadata. */
    private fun lastKnownLocation(): DoubleArray? = try {
        val lm = appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val loc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            ?: lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER)
        if (loc != null) doubleArrayOf(loc.latitude, loc.longitude) else null
    } catch (e: Throwable) {
        Logger.d("Recorder: location unavailable: ${e.message}")
        null
    }

    companion object {
        /** ~4 s of stitched stereo PCM held before frames start being dropped. */
        private const val AUDIO_QUEUE_FRAMES = 400

        /** One stitched frame = 10 ms of audio. */
        private const val PACER_INTERVAL_NS = 10_000_000L

        /** Input backlog above which the pacer skips its sleep and drains. */
        private const val CATCHUP_BACKLOG_MS = 50
    }
}
