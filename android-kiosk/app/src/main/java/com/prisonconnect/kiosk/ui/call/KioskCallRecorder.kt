package com.prisonconnect.kiosk.ui.call

import android.content.Context
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.models.call.RecordingUploadRequest
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.CallRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.webrtc.audio.JavaAudioDeviceModule
import java.io.File
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kiosk-side call recording. Captures raw microphone PCM tapped from the
 * WebRTC audio device module, encodes AAC, muxes a local .mp4, and on call end
 * performs: record -> upload -> verify server ack -> delete local file.
 */
@Singleton
class KioskCallRecorder @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val callRepository: CallRepository
) : JavaAudioDeviceModule.SamplesReadyCallback {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // Encoder state lives entirely inside [worker]; guarded by its own loop.
    @Volatile private var worker: Thread? = null
    @Volatile private var pcmQueue: ArrayBlockingQueue<ByteArray>? = null

    // PCM stream properties, learned from the first delivered samples.
    @Volatile private var sampleRate = 0
    @Volatile private var channelCount = 0
    private val running = AtomicBoolean(false)

    /** Identifier recorded into the uploaded file metadata. roomId doubles as
     *  callId — the backend resolves calls by callId OR roomId. */
    @Volatile private var currentCallId = ""

    fun setCallInfo(roomId: String) {
        currentCallId = roomId
    }

    /** Called by WebRTC's audio device module on every captured mic chunk. */
    override fun onWebRtcAudioRecordSamplesReady(samples: JavaAudioDeviceModule.AudioSamples) {
        if (!running.get()) return
        sampleRate = samples.sampleRate
        channelCount = samples.channelCount
        val bytes = samples.data
        if (bytes.isNotEmpty()) {
            // Offer only; recording must never block or crash the call itself.
            pcmQueue?.offer(bytes)
        }
    }

    @Synchronized
    fun startRecording() {
        if (running.getAndSet(true)) return
        sampleRate = 0
        channelCount = 0

        val dir = File(appContext.cacheDir, "call-recordings")
        if (!dir.exists()) dir.mkdirs()
        val file = File(dir, "rec-${currentCallId.ifEmpty { "unknown" }}-${System.currentTimeMillis()}.mp4")

        val queue = ArrayBlockingQueue<ByteArray>(512)
        pcmQueue = queue

        worker = Thread({ encodeLoop(file, queue) }, "kiosk-call-recorder").apply { start() }
        Logger.d("Recording started -> ${file.absolutePath}")
    }

    @Synchronized
    fun stopRecordingAndUpload() {
        if (!running.getAndSet(false)) return
        pcmQueue = null
        val thread = worker ?: return
        try {
            // Signal EOS via interrupt-safe poll timeout exit; join the worker.
            thread.join(10_000)
        } catch (_: InterruptedException) {}
        worker = null
    }

    /**
     * Runs on a dedicated thread for one session: drains queued PCM into an
     * AAC encoder + MediaMuxer, finalizes the MP4 when the session stops.
     */
    private fun encodeLoop(file: File, queue: ArrayBlockingQueue<ByteArray>) {
        var codec: MediaCodec? = null
        var muxer: MediaMuxer? = null
        var muxerTrack = -1
        var muxerStarted = false
        var totalPcmBytes = 0L

        try {
            while (running.get() || !queue.isEmpty()) {
                val chunk = queue.poll(200, TimeUnit.MILLISECONDS) ?: continue

                if (codec == null && sampleRate > 0 && channelCount > 0) {
                    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, channelCount).apply {
                        setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                        setInteger(MediaFormat.KEY_BIT_RATE, if (channelCount == 2) 128_000 else 64_000)
                        setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16_384)
                    }
                    muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
                    codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).also {
                        it.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                        it.start()
                    }
                }
                if (codec == null || muxer == null) continue // still waiting for stream properties

                val bufferInfo = MediaCodec.BufferInfo()

                // Feed input.
                val inIdx = codec.dequeueInputBuffer(10_000)
                if (inIdx >= 0) {
                    val input = codec.getInputBuffer(inIdx)!!
                    input.clear()
                    val size = minOf(chunk.size, input.capacity())
                    input.put(chunk, 0, size)
                    val ptsUs = totalPcmBytes * 1_000_000 /
                        (sampleRate.toLong() * channelCount * 2).coerceAtLeast(1)
                    codec.queueInputBuffer(inIdx, 0, size, ptsUs, 0)
                    totalPcmBytes += size
                }

                // Drain output.
                while (true) {
                    val outIdx = codec.dequeueOutputBuffer(bufferInfo, 0)
                    if (outIdx == MediaCodec.INFO_TRY_AGAIN_LATER) break
                    if (outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        if (!muxerStarted) {
                            muxerTrack = muxer.addTrack(codec.outputFormat)
                            muxer.start()
                            muxerStarted = true
                        }
                        continue
                    }
                    val encoded = codec.getOutputBuffer(outIdx) ?: continue
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                        bufferInfo.size = 0
                    }
                    if (bufferInfo.size > 0 && muxerStarted && muxerTrack >= 0) {
                        encoded.position(bufferInfo.offset)
                        encoded.limit(bufferInfo.offset + bufferInfo.size)
                        muxer.writeSampleData(muxerTrack, encoded, bufferInfo)
                    }
                    codec.releaseOutputBuffer(outIdx, false)
                }
            }

            // Session stopped — queue an EOS marker, then drain until the
            // encoder emits it (bounded so a wedged codec can't hang us).
            if (codec != null && muxer != null) {
                val bufferInfo = MediaCodec.BufferInfo()
                val finalPtsUs = totalPcmBytes * 1_000_000 /
                    (sampleRate.toLong() * channelCount * 2).coerceAtLeast(1)
                var eosSent = false
                repeat(10) {
                    if (eosSent) return@repeat
                    val inIdx = codec.dequeueInputBuffer(10_000)
                    if (inIdx >= 0) {
                        codec.queueInputBuffer(inIdx, 0, 0, finalPtsUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        eosSent = true
                    }
                }
                val deadline = System.currentTimeMillis() + 2_000
                while (eosSent) {
                    val outIdx = codec.dequeueOutputBuffer(bufferInfo, 10_000)
                    if (outIdx == MediaCodec.INFO_TRY_AGAIN_LATER) break
                    if (outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) continue
                    val encoded = codec.getOutputBuffer(outIdx) ?: continue
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) bufferInfo.size = 0
                    if (bufferInfo.size > 0 && muxerStarted && muxerTrack >= 0) {
                        encoded.position(bufferInfo.offset)
                        encoded.limit(bufferInfo.offset + bufferInfo.size)
                        muxer.writeSampleData(muxerTrack, encoded, bufferInfo)
                    }
                    codec.releaseOutputBuffer(outIdx, false)
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
                    if (System.currentTimeMillis() > deadline) break
                }
            }

            codec?.stop(); codec?.release()
            if (muxerStarted) muxer?.stop()
            muxer?.release()
            Logger.d("Recording finalized: ${file.length()} bytes")
            scope.launch { uploadVerifyDelete(file) }
        } catch (e: Exception) {
            Logger.e("Recording encode failed - discarding partial file", e)
            try { codec?.stop(); codec?.release() } catch (_: Exception) {}
            try { if (muxerStarted) muxer?.stop(); muxer?.release() } catch (_: Exception) {}
            file.delete()
        }
    }

    private suspend fun uploadVerifyDelete(file: File) {
        // Nothing usable captured (e.g. call abandoned before audio started):
        // MediaMuxer leaves an empty/missing file — skip upload entirely.
        if (!file.exists() || file.length() < 1024) {
            Logger.d("Recording empty (${file.length()} bytes) - nothing to upload, discarding")
            file.delete()
            return
        }
        try {
            val base64 = android.util.Base64.encodeToString(file.readBytes(), android.util.Base64.NO_WRAP)
            // Collect exactly one terminal result from the upload flow.
            val result = callRepository.uploadRecording(
                RecordingUploadRequest(
                    callId = currentCallId,
                    base64Data = base64,
                    fileName = file.name,
                    mimeType = "video/mp4"
                )
            ).first()
            when (result) {
                is NetworkResult.Success -> {
                    val recordingId = result.data.recordingId
                    if (!recordingId.isNullOrEmpty()) {
                        // Verified upload — safe to delete the local copy.
                        val deleted = file.delete()
                        Logger.d("Recording uploaded ($recordingId), local deleted=$deleted")
                    } else {
                        Logger.e("Recording upload ACK missing recordingId - keeping local file ${file.name}")
                    }
                }
                else -> Logger.e("Recording upload failed - keeping local file ${file.name}")
            }
        } catch (e: Exception) {
            Logger.e("Recording upload error - keeping local file", e)
        }
    }
}
