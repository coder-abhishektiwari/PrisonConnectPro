package com.prisonconnect.kiosk.ui.call

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.os.Build
import android.view.Surface
import com.prisonconnect.kiosk.core.Logger
import org.webrtc.EglBase
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Hardware (with software fallback) H.264 surface encoder feeding one shared
 * [RecordingMuxer].
 *
 * Frames are pushed by calling [renderFrame] with a draw lambda: the lambda
 * runs with this encoder's EGL surface current, so the caller can composite
 * live WebRTC textures straight onto the codec's input surface — GPU compose +
 * hardware encode, no CPU pixel copies, no extra work on WebRTC's threads.
 *
 * Latency policy: every call is non-blocking for the caller beyond what the
 * codec's surface demands; if the encoder falls behind, later frames are
 * simply dropped by the caller (see [isRunning]).
 */
class RecordingVideoEncoder(
    private val muxer: RecordingMuxer,
    private val width: Int,
    private val height: Int,
    private val fps: Int,
    private val bitrate: Int,
    private val codecName: String? = null,
    private val sharedEglContext: EglBase.Context? = null
) {
    private val running = AtomicBoolean(false)

    private var codec: MediaCodec? = null
    private var egl: EglBase? = null
    private var inputSurface: Surface? = null
    private var trackIndex = -1
    private var encodedFrames = 0L

    val isRunning: Boolean get() = running.get()
    val frameCount: Long get() = encodedFrames

    /** Binds this encoder's EGL surface to the calling thread (render thread). */
    fun makeCurrent() {
        try { egl?.makeCurrent() } catch (_: Throwable) {}
    }

    fun start(): Boolean {
        if (running.getAndSet(true)) return true
        return try {
            val encoder = if (codecName != null) {
                MediaCodec.createByCodecName(codecName)
            } else {
                MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            }
            try {
                encoder.configure(buildFormat(rateMode = true), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            } catch (e: IllegalArgumentException) {
                // Not every encoder accepts KEY_BITRATE_MODE — retry without it.
                encoder.configure(buildFormat(rateMode = false), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            }
            val surface = encoder.createInputSurface()
            encoder.start()
            codec = encoder
            inputSurface = surface

            // EglBase.create(...) builds the context eagerly in this WebRTC build.
            val eglBase = EglBase.create(sharedEglContext, EglBase.CONFIG_RECORDABLE)
            eglBase.createSurface(surface)
            eglBase.makeCurrent()
            this.egl = eglBase

            Logger.d("VideoEncoder started codec=${encoder.name} ${width}x$height@$fps ${bitrate}bps")
            true
        } catch (e: Throwable) {
            Logger.e("VideoEncoder start failed (codec=$codecName)", e)
            releaseInternal()
            running.set(false)
            false
        }
    }

    /** Draws one composed frame at [timestampNs] (WebRTC frame clock) and drains the encoder. */
    fun renderFrame(timestampNs: Long, draw: () -> Unit): Boolean {
        if (!running.get()) return false
        val eglBase = egl ?: return false
        return try {
            eglBase.makeCurrent()
            draw()
            eglBase.swapBuffers(timestampNs)
            drain(blocking = false)
            encodedFrames++
            true
        } catch (e: Throwable) {
            Logger.e("VideoEncoder render failed", e)
            false
        }
    }

    /** Signals EOS, drains the tail, and releases every resource. Returns true if the file is complete. */
    fun stop(): Boolean {
        if (!running.getAndSet(false)) return false
        var ok = false
        try {
            codec?.signalEndOfInputStream()
            ok = drainUntilEos()
        } catch (e: Throwable) {
            Logger.e("VideoEncoder EOS failed", e)
        } finally {
            releaseInternal()
        }
        Logger.d("VideoEncoder stopped frames=$encodedFrames ok=$ok")
        return ok
    }

    private fun buildFormat(rateMode: Boolean): MediaFormat =
        MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
            setInteger(MediaFormat.KEY_FRAME_RATE, fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, GOP_SECONDS)
            if (rateMode && Build.VERSION.SDK_INT >= 29) {
                setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)
            }
        }

    private fun drain(blocking: Boolean) {
        val encoder = codec ?: return
        val info = MediaCodec.BufferInfo()
        while (true) {
            val index = encoder.dequeueOutputBuffer(info, if (blocking) 10_000L else 0L)
            when {
                index == MediaCodec.INFO_TRY_AGAIN_LATER -> return
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    val track = muxer.registerTrack(encoder.outputFormat)
                    trackIndex = track ?: -1
                    if (trackIndex < 0) Logger.e("VideoEncoder muxer rejected track")
                }
                index == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED -> continue
                index >= 0 -> {
                    writeIfData(encoder, index, info)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
            }
        }
    }

    private fun drainUntilEos(): Boolean {
        val encoder = codec ?: return false
        val info = MediaCodec.BufferInfo()
        val deadline = System.currentTimeMillis() + EOS_DEADLINE_MS
        while (System.currentTimeMillis() < deadline) {
            val index = encoder.dequeueOutputBuffer(info, 10_000L)
            when {
                index == MediaCodec.INFO_TRY_AGAIN_LATER -> continue
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    val track = muxer.registerTrack(encoder.outputFormat)
                    trackIndex = track ?: -1
                }
                index == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED -> continue
                index >= 0 -> {
                    val eos = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                    writeIfData(encoder, index, info)
                    if (eos) return true
                }
            }
        }
        return false
    }

    private fun writeIfData(encoder: MediaCodec, index: Int, info: MediaCodec.BufferInfo) {
        try {
            if (info.size > 0 && trackIndex >= 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                val buffer = encoder.getOutputBuffer(index)
                if (buffer != null) {
                    buffer.position(info.offset)
                    buffer.limit(info.offset + info.size)
                    muxer.write(trackIndex, buffer, info)
                }
            }
        } finally {
            encoder.releaseOutputBuffer(index, false)
        }
    }

    private fun releaseInternal() {
        val eglBase = egl
        egl = null
        if (eglBase != null) {
            try { if (eglBase.hasSurface()) eglBase.releaseSurface() } catch (_: Throwable) {}
            try { eglBase.detachCurrent() } catch (_: Throwable) {}
            try { eglBase.release() } catch (_: Throwable) {}
        }
        try { codec?.stop() } catch (_: Throwable) {}
        try { codec?.release() } catch (_: Throwable) {}
        codec = null
        try { inputSurface?.release() } catch (_: Throwable) {}
        inputSurface = null
        trackIndex = -1
    }

    companion object {
        private const val GOP_SECONDS = 2
        private const val EOS_DEADLINE_MS = 3_000L
    }
}
