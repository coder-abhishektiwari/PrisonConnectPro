package com.prisonconnect.kiosk.ui.call

import org.webrtc.audio.JavaAudioDeviceModule

/**
 * Merges the two WebRTC audio taps — kiosk microphone ([pushMic]) and the
 * family's playout ([pushPlayback]) — into ONE interleaved stereo PCM stream:
 * left = kiosk, right = family.
 *
 * The two taps run on different WebRTC audio threads with independent clocks,
 * so each side is resampled to [TARGET_RATE], held in a bounded FIFO and
 * emitted in lock-step with the microphone: a slightly late family side is
 * padded with silence, a runaway one is trimmed. Both callbacks are non-
 * blocking (offer-only) so nothing here can ever stall the live call.
 */
internal class StereoStitcher {

    /** Fixed encoder input rate — WebRTC hands us whatever the device uses. */
    private val mic = Source()
    private val remote = Source()

    fun reset() {
        synchronized(this) {
            mic.reset()
            remote.reset()
        }
    }

    /** Kiosk microphone chunk (16-bit PCM, mono or stereo — stereo is downmixed). */
    fun pushMic(samples: JavaAudioDeviceModule.AudioSamples) = synchronized(this) {
        mic.push(samples.sampleRate, samples.channelCount, samples.data)
    }

    /** Family-side playout chunk (16-bit PCM, mono or stereo — downmixed). */
    fun pushPlayback(samples: JavaAudioDeviceModule.AudioSamples) = synchronized(this) {
        remote.push(samples.sampleRate, samples.channelCount, samples.data)
    }

    /**
     * Pops one 10 ms stereo frame, or null when the mic side has not caught up.
     * Call repeatedly until it returns null (drive side: microphone).
     */
    fun poll(): ByteArray? = synchronized(this) {
        if (mic.out.size < FRAME_SAMPLES) return null

        // Bound both sides so a stalled partner can never grow without limit.
        if (mic.out.size > MAX_DEPTH) mic.out.dropOldest(mic.out.size - MAX_DEPTH)
        if (remote.out.size > MAX_DEPTH) remote.out.dropOldest(remote.out.size - MAX_DEPTH)

        val bytes = ByteArray(FRAME_SAMPLES * 4)
        var o = 0
        for (i in 0 until FRAME_SAMPLES) {
            val l = mic.out.popShort()
            val r = remote.out.popShort() // 0 = silence while the side is behind
            bytes[o] = (l.toInt() and 0xFF).toByte()
            bytes[o + 1] = (l.toInt() shr 8 and 0xFF).toByte()
            bytes[o + 2] = (r.toInt() and 0xFF).toByte()
            bytes[o + 3] = (r.toInt() shr 8 and 0xFF).toByte()
            o += 4
        }
        bytes
    }

    /** One input side: resamples to [TARGET_RATE] and buffers in [out]. */
    private class Source {
        private val window = ArrayDeque<Float>()
        private var srcRate = 0
        private var phase = 0.0
        val out = Ring(TARGET_RATE / 4) // 250 ms

        fun reset() {
            window.clear()
            srcRate = 0
            phase = 0.0
            out.clear()
        }

        fun push(rate: Int, channels: Int, data: ByteArray) {
            if (rate <= 0 || data.isEmpty()) return
            if (srcRate == 0) srcRate = rate
            if (rate != srcRate) {
                srcRate = rate
                window.clear()
                phase = 0.0
            }

            // 16-bit little-endian -> mono floats (stereo/ch+ is averaged).
            val frames = data.size / 2 / channels.coerceAtLeast(1)
            for (f in 0 until frames) {
                var sum = 0f
                for (c in 0 until channels) {
                    val i = (f * channels + c) * 2
                    if (i + 1 >= data.size) break
                    val v = (data[i].toInt() and 0xFF) or (data[i + 1].toInt() shl 8)
                    sum += (v.toShort().toInt() / 32768f)
                }
                window.addLast(sum / channels.coerceAtLeast(1))
            }

            if (srcRate == TARGET_RATE) {
                while (window.isNotEmpty()) out.push(window.removeFirst())
                phase = 0.0
                return
            }

            // Streaming linear interpolation: phase walks the input window at
            // srcRate/TARGET_RATE input samples per emitted sample.
            val ratio = srcRate.toDouble() / TARGET_RATE
            while (window.size >= phase + 2) {
                val i0 = phase.toInt().coerceAtLeast(0)
                val frac = (phase - i0).toFloat()
                val a = window.elementAt(i0)
                val b = window.elementAt(i0 + 1)
                out.push(a + (b - a) * frac)
                phase += ratio
            }
            // Drop samples that are fully behind the interpolation point.
            val trim = phase.toInt()
            if (trim > 0) {
                repeat(trim) { if (window.isNotEmpty()) window.removeFirst() }
                phase -= trim
            }
        }
    }

    /** Fixed-capacity float FIFO; a full push overwrites the oldest sample. */
    private class Ring(private val capacity: Int) {
        private val buf = FloatArray(capacity)
        private var head = 0
        private var count = 0

        val size: Int get() = count

        fun push(v: Float) {
            if (count == capacity) {
                buf[head] = v
                head = (head + 1) % capacity
            } else {
                buf[(head + count) % capacity] = v
                count++
            }
        }

        fun popShort(): Short {
            if (count == 0) return 0
            val v = buf[head]
            head = (head + 1) % capacity
            count--
            return (v * 32767f).toInt().coerceIn(-32768, 32767).toShort()
        }

        fun dropOldest(n: Int) {
            repeat(n.coerceAtMost(count)) {
                head = (head + 1) % capacity
                count--
            }
        }

        fun clear() {
            head = 0
            count = 0
        }
    }

    companion object {
        const val TARGET_RATE = 48_000
        const val FRAME_SAMPLES = TARGET_RATE / 100 // 10 ms
        const val CHANNELS = 2

        /** ~250 ms of slack before an out-of-sync side gets trimmed. */
        private const val MAX_DEPTH = TARGET_RATE / 4
    }
}
