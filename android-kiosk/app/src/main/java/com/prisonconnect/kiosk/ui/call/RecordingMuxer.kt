package com.prisonconnect.kiosk.ui.call

import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMuxer
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
 */
class RecordingMuxer(
    outputFile: File,
    private var expectedTracks: Int,
    location: DoubleArray? = null
) {
    private class Pending(val track: Int, val info: MediaCodec.BufferInfo, val bytes: ByteArray)

    private val lock = Object()
    private val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    private val pending = ArrayDeque<Pending>()
    private var registered = 0
    private var started = false
    private var released = false

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
            runCatching { muxer.writeSampleData(track, data, info) }
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
