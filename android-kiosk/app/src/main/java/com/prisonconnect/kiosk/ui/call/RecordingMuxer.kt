package com.prisonconnect.kiosk.ui.call

import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMuxer
import com.prisonconnect.kiosk.core.Logger
import java.io.File
import java.nio.ByteBuffer

/**
 * Thread-safe wrapper over [MediaMuxer] shared by the audio and video
 * encoders of one recording session.
 *
 * MediaMuxer refuses samples until every track has been registered, so the
 * expected track count is fixed up-front and early samples are buffered
 * (bounded) instead of dropped — the audio encoder normally produces its
 * first frame before the video encoder reports its output format, and
 * dropping those would shift A/V alignment.
 *
 * The video encoder is fed presentation times on the session's absolute
 * nanoTime clock; they are normalised back to a 0-based timeline here (see
 * [normaliseVideoPts]) so the file starts at t=0 and stays in sync with the
 * audio track's wall-clock timestamps.
 */
class RecordingMuxer(
    outputFile: File,
    private var expectedTracks: Int,
    location: DoubleArray? = null,
    sessionStartNs: Long = 0L
) {
    private class Pending(val track: Int, val info: MediaCodec.BufferInfo, val bytes: ByteArray)

    private val lock = Object()
    private val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    private val pending = ArrayDeque<Pending>()
    private var registered = 0
    private var started = false
    private var released = false
    private var videoTrack = -1
    private val sessionStartUs = sessionStartNs / 1000
    private var videoPtsLogged = false

    init {
        // Audit trail: where the kiosk was while this call was recorded.
        // Must be set before the muxer starts (see MediaMuxer.setLocation).
        if (location != null && location.size == 2) {
            runCatching {
                muxer.setLocation(location[0].toFloat(), location[1].toFloat())
            }
        }
    }

    /** Registers a track; returns its index, or null when unusable. */
    fun registerTrack(format: MediaFormat): Int? = synchronized(lock) {
        if (released || started) return null
        val index = muxer.addTrack(format)
        if (format.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true) {
            videoTrack = index
        }
        registered++
        if (registered >= expectedTracks && !started) {
            muxer.start()
            started = true
            for (p in pending) {
                runCatching { muxer.writeSampleData(p.track, ByteBuffer.wrap(p.bytes), p.info) }
            }
            pending.clear()
        }
        index
    }

    /**
     * Freezes the track list at however many tracks arrived. Used when the
     * video side failed to start: audio must keep flowing instead of waiting
     * for a track that will never show up.
     */
    fun completeTrackList() = synchronized(lock) {
        if (released || started) return
        expectedTracks = registered
        if (expectedTracks > 0) {
            muxer.start()
            started = true
            for (p in pending) {
                runCatching { muxer.writeSampleData(p.track, ByteBuffer.wrap(p.bytes), p.info) }
            }
            pending.clear()
        }
    }

    /** Queues an encoded sample; buffered (bounded) until the muxer starts. */
    fun write(track: Int, data: ByteBuffer, info: MediaCodec.BufferInfo) {
        synchronized(lock) {
            if (released) return
            if (track == videoTrack) normaliseVideoPts(info)
            if (!started) {
                // Copy out: the codec reuses its output buffer on releaseOutputBuffer.
                val copy = MediaCodec.BufferInfo().apply { set(0, info.size, info.presentationTimeUs, info.flags) }
                val bytes = ByteArray(info.size)
                data.position(info.offset)
                data.get(bytes)
                if (pending.size >= MAX_PENDING) pending.removeFirst()
                pending.addLast(Pending(track, copy, bytes))
                return
            }
            try {
                muxer.writeSampleData(track, data, info)
            } catch (e: Throwable) {
                Logger.w("Muxer: write failed track=$track pts=${info.presentationTimeUs} size=${info.size}: $e")
            }
        }
    }

    /**
     * Rewrites the video track's presentation time onto the session's 0-based
     * timeline. The encoder is handed absolute nanoTime-based stamps; some
     * HALs pass them through untouched, others re-stamp outputs from zero
     * with their own frame clock (which compresses the whole call into
     * frames/fps seconds and desyncs it from audio). Both shapes are
     * accepted — anything already below half the session clock is treated
     * as re-stamped and left alone; results are never negative.
     */
    private fun normaliseVideoPts(info: MediaCodec.BufferInfo) {
        val pts = info.presentationTimeUs
        if (pts >= sessionStartUs / 2) {
            info.presentationTimeUs = (pts - sessionStartUs).coerceAtLeast(0L)
        }
        if (!videoPtsLogged && sessionStartUs > 0) {
            videoPtsLogged = true
            Logger.i(
                "Muxer: video pts raw=$pts sessionStartUs=$sessionStartUs " +
                    "-> ${info.presentationTimeUs} (pass-through=${pts >= sessionStartUs / 2})"
            )
        }
    }

    fun finish() {
        synchronized(lock) {
            if (released) return
            released = true
            if (started) runCatching { muxer.stop() }
            runCatching { muxer.release() }
        }
    }

    companion object {
        /** ~2.5 s of 10 ms audio frames — plenty to bridge the video format handshake. */
        private const val MAX_PENDING = 256
    }
}
