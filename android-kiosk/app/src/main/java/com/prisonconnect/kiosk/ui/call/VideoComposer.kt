package com.prisonconnect.kiosk.ui.call

import android.graphics.Matrix
import android.opengl.GLES20
import com.prisonconnect.kiosk.core.Logger
import org.webrtc.GlRectDrawer
import org.webrtc.VideoFrame
import org.webrtc.VideoFrameDrawer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.LockSupport

/**
 * Composites the two video sides onto the recording encoder's input surface:
 * the family's video fills the frame, the kiosk camera sits in a picture-in-
 * picture corner, and both are drawn straight onto the hardware H.264 input
 * surface by [RecordingVideoEncoder] — GPU compose + hardware encode, no CPU
 * pixel copies and nothing extra running on WebRTC's own threads.
 *
 * [VideoFrameDrawer] takes care of rotation, I420 uploads and texture frames,
 * so both sources go through the same call. A single render thread ticks at
 * the profile's frame rate and always uses the latest frame per side
 * (older ones are dropped instead of queued, so a slow decode can never build
 * up latency).
 */
internal class VideoComposer(
    private val encoder: RecordingVideoEncoder,
    private val profile: RecordingProfile,
    private val sessionStartNs: Long = System.nanoTime()
) {
    private val running = AtomicBoolean(false)
    private var thread: Thread? = null

    private val localSlot = FrameSlot()
    private val remoteSlot = FrameSlot()
    private val localCount = java.util.concurrent.atomic.AtomicLong()
    private val remoteCount = java.util.concurrent.atomic.AtomicLong()

    private var drawer: GlRectDrawer? = null
    private var frameDrawer: VideoFrameDrawer? = null

    // Cached composite kept as an FBO texture — NOT as a retained VideoFrame
    // (this WebRTC build stalls every video sink while one is held). The FBO
    // holds the last frame BOTH sides were present for; ticks where a side
    // misses simply re-emit it. Drawing a partial composite (or clearing to
    // black) on those ticks is what made recordings flicker.
    private var fboId = 0
    private var fboTex = 0
    private var blitProgram = 0
    private var posAttr = -1
    private var texAttr = -1
    private var texUniform = -1
    private var posBuffer: FloatBuffer? = null
    private var texBuffer: FloatBuffer? = null
    private var compositeValid = false

    @Volatile private var framesRendered = 0L

    val isRunning: Boolean get() = running.get()
    val frameCount: Long get() = framesRendered

    fun onLocalFrame(frame: VideoFrame) {
        val n = localCount.incrementAndGet()
        if (n <= 3 || n % 100 == 0L) Logger.d("Composer: local frame#$n enter")
        if (running.get()) localSlot.set(frame)
        if (n <= 3) Logger.d("Composer: local frame#$n done")
    }

    fun onRemoteFrame(frame: VideoFrame) {
        val n = remoteCount.incrementAndGet()
        if (n <= 3 || n % 100 == 0L) Logger.d("Composer: remote frame#$n enter")
        if (running.get()) remoteSlot.set(frame)
        if (n <= 3) Logger.d("Composer: remote frame#$n done")
    }

    /** Spawns the render thread; returns false when the GL side failed. */
    fun start(): Boolean {
        if (running.getAndSet(true)) return true
        val latch = CountDownLatch(1)
        var ok = false
        thread = Thread({
            ok = initGl()
            latch.countDown()
            if (ok) {
                loop()
                cleanupGl()
            }
        }, "rec-compose").apply {
            isDaemon = true
            start()
        }
        val waited = latch.await(START_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        if (!waited || !ok) {
            running.set(false)
            try { thread?.join(1000) } catch (_: InterruptedException) {}
            thread = null
            Logger.w("VideoComposer failed to initialise (waited=$waited ok=$ok)")
        }
        return ok && running.get()
    }

    /** Stops rendering and waits for the thread to release its GL resources. */
    fun stop() {
        if (!running.compareAndSet(true, false)) return
        try {
            thread?.join(STOP_TIMEOUT_MS)
        } catch (_: InterruptedException) {}
        thread = null
        localSlot.clear()
        remoteSlot.clear()
        Logger.d("VideoComposer stopped frames=$framesRendered")
    }

    // ---- render thread ----

    private fun initGl(): Boolean = try {
        encoder.makeCurrent()
        drawer = GlRectDrawer()
        frameDrawer = VideoFrameDrawer()
        initBlitPipeline()
    } catch (e: Throwable) {
        Logger.e("VideoComposer GL init failed", e)
        false
    }

    private fun cleanupGl() {
        try {
            encoder.makeCurrent()
            releaseBlitPipeline()
            frameDrawer?.release()
            drawer?.release()
        } catch (e: Throwable) {
            Logger.w("VideoComposer GL cleanup failed: ${e.message}")
        }
        // Unbind before this thread dies, so the session's stop path can
        // destroy the context from whatever thread ends up owning it.
        encoder.detachCurrent()
        frameDrawer = null
        drawer = null
    }

    private fun loop() {
        val intervalNs = NANOS_PER_SECOND / profile.fps
        val startNs = System.nanoTime()
        var index = 0L

        while (running.get()) {
            val targetNs = startNs + index * intervalNs
            val waitNs = targetNs - System.nanoTime()
            if (waitNs > PARK_THRESHOLD_NS) LockSupport.parkNanos(waitNs)

            // Presentation times ride the session's absolute nanoTime clock
            // (RecordingMuxer subtracts the base back off). HALs re-stamp
            // zero-based input timestamps with their own frame clock, which
            // compresses the whole recording; absolute stamps pass through.
            renderOnce(sessionStartNs + index * intervalNs)

            // If rendering fell behind, jump the clock forward instead of
            // bursting frames: the file stays in sync with the wall clock and
            // the encoder never gets a queue of back-dated frames.
            index++
            val behind = System.nanoTime() - (startNs + index * intervalNs)
            if (behind > intervalNs * 2) {
                index += (behind / intervalNs).coerceAtMost(profile.fps * 10L)
            }
        }
    }

    private fun renderOnce(ptsNs: Long) {
        val local = localSlot.take()
        val remote = remoteSlot.take()
        try {
            val bothFresh = local != null && remote != null
            val seedComposite = !compositeValid && (local != null || remote != null)
            // No fresh frames AND no cached composite to fall back to: emit
            // nothing. The encoder surface keeps whatever the codec last
            // displayed, so playback freezes instead of flashing black.
            if (!bothFresh && !seedComposite && !compositeValid) return
            val update = bothFresh || seedComposite
            val drawn = encoder.renderFrame(ptsNs) {
                if (update) {
                    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fboId)
                    compose(local, remote)
                    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
                    if (bothFresh) compositeValid = true
                }
                blitComposite()
            }
            if (drawn) framesRendered++
        } finally {
            local?.release()
            remote?.release()
            // Release the stored frames after EVERY tick. This WebRTC build
            // stops delivering the next frame to any sink (recorder, UI,
            // sender encoder, camera statistics) while the previously
            // delivered frame is still retained. Holding a frame until its
            // replacement arrives therefore deadlocks the whole video
            // pipeline after the very first frame; holding it for at most
            // one tick keeps every sink fed at the profile's frame rate.
            localSlot.clear()
            remoteSlot.clear()
        }
    }

    private fun compose(local: VideoFrame?, remote: VideoFrame?) {
        val d = drawer ?: return
        val fd = frameDrawer ?: return
        GLES20.glViewport(0, 0, profile.width, profile.height)
        GLES20.glClearColor(BACKGROUND_R, BACKGROUND_G, BACKGROUND_B, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)

        // Family video letterboxed over the whole frame, when present.
        remote?.let {
            val r = fit(it.rotatedWidth, it.rotatedHeight, 0, 0, profile.width, profile.height)
            fd.drawFrame(it, d, IDENTITY, r[0], r[1], r[2], r[3])
        }

        // Kiosk camera in the bottom-right corner, when present. Each side
        // keeps its FIXED position even when the other side misses a tick —
        // the old full-screen fallbacks made the two videos appear to swap
        // whenever a frame was late.
        local?.let {
            val boxW = (profile.width * PIP_WIDTH_FRACTION).toInt()
            val boxH = (profile.height * PIP_HEIGHT_FRACTION).toInt()
            val margin = (profile.width * PIP_MARGIN_FRACTION).toInt()
            val pip = fit(
                it.rotatedWidth, it.rotatedHeight,
                profile.width - boxW - margin, margin, boxW, boxH
            )
            fd.drawFrame(it, d, IDENTITY, pip[0], pip[1], pip[2], pip[3])
        }
    }

    /** Largest rect of [srcW]x[srcH] that fits inside the destination, centred. */
    private fun fit(srcW: Int, srcH: Int, dstX: Int, dstY: Int, dstW: Int, dstH: Int): IntArray {
        if (srcW <= 0 || srcH <= 0) return intArrayOf(dstX, dstY, dstW, dstH)
        val scale = minOf(dstW.toFloat() / srcW, dstH.toFloat() / srcH)
        val w = (srcW * scale).toInt().coerceIn(1, dstW)
        val h = (srcH * scale).toInt().coerceIn(1, dstH)
        return intArrayOf(dstX + (dstW - w) / 2, dstY + (dstH - h) / 2, w, h)
    }

    // ---- composite cache (FBO) + blit ----

    /** Creates the RGBA cache texture, its FBO, and the 2D blit program. */
    private fun initBlitPipeline(): Boolean {
        val vert = compileShader(GLES20.GL_VERTEX_SHADER, VERT_SRC) ?: return false
        val frag = compileShader(GLES20.GL_FRAGMENT_SHADER, FRAG_SRC) ?: run {
            GLES20.glDeleteShader(vert)
            return false
        }
        val prog = GLES20.glCreateProgram()
        GLES20.glAttachShader(prog, vert)
        GLES20.glAttachShader(prog, frag)
        GLES20.glLinkProgram(prog)
        GLES20.glDeleteShader(vert)
        GLES20.glDeleteShader(frag)
        val linked = IntArray(1)
        GLES20.glGetProgramiv(prog, GLES20.GL_LINK_STATUS, linked, 0)
        if (linked[0] == 0) {
            Logger.w("VideoComposer blit link failed: ${GLES20.glGetProgramInfoLog(prog)}")
            GLES20.glDeleteProgram(prog)
            return false
        }
        blitProgram = prog
        posAttr = GLES20.glGetAttribLocation(prog, "aPos")
        texAttr = GLES20.glGetAttribLocation(prog, "aTex")
        texUniform = GLES20.glGetUniformLocation(prog, "uTex")

        val quad = floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)
        val texCoords = floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f, 1f, 1f)
        posBuffer = ByteBuffer.allocateDirect(quad.size * 4)
            .order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(quad); position(0) }
        texBuffer = ByteBuffer.allocateDirect(texCoords.size * 4)
            .order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(texCoords); position(0) }

        val tex = IntArray(1)
        GLES20.glGenTextures(1, tex, 0)
        fboTex = tex[0]
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, fboTex)
        GLES20.glTexImage2D(
            GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA,
            profile.width, profile.height, 0,
            GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null
        )
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        val fb = IntArray(1)
        GLES20.glGenFramebuffers(1, fb, 0)
        fboId = fb[0]
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fboId)
        GLES20.glFramebufferTexture2D(
            GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0,
            GLES20.GL_TEXTURE_2D, fboTex, 0
        )
        val status = GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        if (status != GLES20.GL_FRAMEBUFFER_COMPLETE) {
            Logger.w("VideoComposer FBO incomplete (status=$status)")
            releaseBlitPipeline()
            return false
        }
        return true
    }

    private fun compileShader(type: Int, source: String): Int? {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, source)
        GLES20.glCompileShader(shader)
        val compiled = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0)
        if (compiled[0] == 0) {
            Logger.w("VideoComposer shader compile failed: ${GLES20.glGetShaderInfoLog(shader)}")
            GLES20.glDeleteShader(shader)
            return null
        }
        return shader
    }

    /** Draws the cached composite full-frame onto the encoder's input surface. */
    private fun blitComposite() {
        val program = blitProgram
        val pb = posBuffer ?: return
        val tb = texBuffer ?: return
        if (program == 0 || fboTex == 0) return
        GLES20.glUseProgram(program)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, fboTex)
        GLES20.glUniform1i(texUniform, 0)
        GLES20.glEnableVertexAttribArray(posAttr)
        GLES20.glVertexAttribPointer(posAttr, 2, GLES20.GL_FLOAT, false, 0, pb)
        GLES20.glEnableVertexAttribArray(texAttr)
        GLES20.glVertexAttribPointer(texAttr, 2, GLES20.GL_FLOAT, false, 0, tb)
        GLES20.glViewport(0, 0, profile.width, profile.height)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(posAttr)
        GLES20.glDisableVertexAttribArray(texAttr)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
        GLES20.glUseProgram(0)
    }

    /** Frees the FBO, its texture and the blit program. GL must be current. */
    private fun releaseBlitPipeline() {
        if (fboId != 0) {
            GLES20.glDeleteFramebuffers(1, intArrayOf(fboId), 0)
            fboId = 0
        }
        if (fboTex != 0) {
            GLES20.glDeleteTextures(1, intArrayOf(fboTex), 0)
            fboTex = 0
        }
        if (blitProgram != 0) {
            GLES20.glDeleteProgram(blitProgram)
            blitProgram = 0
        }
        posBuffer = null
        texBuffer = null
        compositeValid = false
    }

    /**
     * Holds the newest frame per side with its own retain, so the WebRTC
     * threads can swap it out while the render thread is still drawing it.
     */
    private class FrameSlot {
        private var frame: VideoFrame? = null

        fun set(new: VideoFrame) {
            val old: VideoFrame?
            synchronized(this) {
                val tRetain = System.nanoTime()
                new.retain()
                val retainMs = (System.nanoTime() - tRetain) / 1_000_000
                if (retainMs > 100) Logger.w("FrameSlot: new.retain took ${retainMs}ms")
                old = frame
                frame = new
            }
            if (old != null) {
                val t0 = System.nanoTime()
                old.release()
                val ms = (System.nanoTime() - t0) / 1_000_000
                if (ms > 100) Logger.w("FrameSlot: old.release took ${ms}ms")
            }
        }

        fun take(): VideoFrame? = synchronized(this) {
            val f = frame
            if (f != null) {
                val t0 = System.nanoTime()
                f.retain()
                val ms = (System.nanoTime() - t0) / 1_000_000
                if (ms > 100) Logger.w("FrameSlot: take retain took ${ms}ms")
            }
            f
        }

        fun clear() {
            val old: VideoFrame?
            synchronized(this) {
                old = frame
                frame = null
            }
            if (old != null) {
                val t0 = System.nanoTime()
                old.release()
                val ms = (System.nanoTime() - t0) / 1_000_000
                if (ms > 100) Logger.w("FrameSlot: clear release took ${ms}ms")
            }
        }
    }

    companion object {
        private const val NANOS_PER_SECOND = 1_000_000_000L
        private const val PARK_THRESHOLD_NS = 200_000L
        private const val START_TIMEOUT_MS = 4_000L
        private const val STOP_TIMEOUT_MS = 4_000L

        private const val PIP_WIDTH_FRACTION = 0.30f
        private const val PIP_HEIGHT_FRACTION = 0.22f
        private const val PIP_MARGIN_FRACTION = 0.035f

        private const val BACKGROUND_R = 0.04f
        private const val BACKGROUND_G = 0.06f
        private const val BACKGROUND_B = 0.09f

        /** Identity transform — [VideoFrameDrawer] already applies rotation/flip. */
        private val IDENTITY = Matrix()

        /** Fullscreen-quad passthrough for blitting the cached composite. */
        private const val VERT_SRC = """
            attribute vec4 aPos;
            attribute vec2 aTex;
            varying vec2 vTex;
            void main() {
                gl_Position = aPos;
                vTex = aTex;
            }
        """

        private const val FRAG_SRC = """
            precision mediump float;
            varying vec2 vTex;
            uniform sampler2D uTex;
            void main() {
                gl_FragColor = texture2D(uTex, vTex);
            }
        """
    }
}
