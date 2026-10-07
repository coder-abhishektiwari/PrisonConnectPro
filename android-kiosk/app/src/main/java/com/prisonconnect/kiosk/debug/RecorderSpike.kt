package com.prisonconnect.kiosk.debug

import android.content.Context
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaMetadataRetriever
import android.opengl.GLES20
import android.os.Build
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.ui.call.RecordingMuxer
import com.prisonconnect.kiosk.ui.call.RecordingVideoEncoder
import java.io.File

/**
 * On-device go/no-go probe for the call recording pipeline: encodes a short
 * synthetic clip through [RecordingVideoEncoder] (surface input + EGL compose
 * + MP4 mux) with every interesting AVC encoder on this device, then reads the
 * file back with MediaMetadataRetriever.
 *
 * Trigger (debug builds only):
 *   adb shell am broadcast -a com.prisonconnect.kiosk.action.RECORDER_SPIKE
 * Results land in logcat under [TAG].
 */
object RecorderSpike {

    private const val TAG = "REC-SPIKE"
    private const val WIDTH = 640
    private const val HEIGHT = 360
    private const val FPS = 30
    private const val FRAMES = 45
    private const val BITRATE = 600_000

    fun run(context: Context) {
        val dir = File(context.cacheDir, "spike").apply { mkdirs() }

        val encoders = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
            .filter { info ->
                info.isEncoder &&
                    info.supportedTypes.any { it.equals("video/avc", ignoreCase = true) }
            }
            .map { it.name to isHardware(it) }

        Logger.i("$TAG available AVC encoders=$encoders")
        if (encoders.isEmpty()) {
            Logger.i("$TAG RESULT fail reason=no-avc-encoder")
            return
        }

        // One hardware candidate (primary path) + one software candidate (fallback path).
        val hw = encoders.firstOrNull { it.second }?.first
        val sw = encoders.firstOrNull { !it.second }?.first
        val toTest = listOfNotNull(hw, sw)

        for ((name, hwFlag) in encoders.filter { it.first in toTest }) {
            testOne(dir, name, hwFlag)
        }
    }

    private fun testOne(dir: File, name: String, hw: Boolean) {
        val file = File(dir, "spike-${name.replace(Regex("[^A-Za-z0-9]"), "_")}.mp4")
        file.delete()

        val muxer = RecordingMuxer(file, expectedTracks = 1)
        val encoder = RecordingVideoEncoder(
            muxer = muxer,
            width = WIDTH,
            height = HEIGHT,
            fps = FPS,
            bitrate = BITRATE,
            codecName = name
        )

        val startedAt = System.nanoTime()
        val started = encoder.start()
        var rendered = 0
        if (started) {
            for (i in 0 until FRAMES) {
                val shade = (i % FPS) / FPS.toFloat()
                val ok = encoder.renderFrame(startedAt + i * (1_000_000_000L / FPS)) {
                    GLES20.glClearColor(shade, 1f - shade, 0.25f, 1f)
                    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
                }
                if (!ok) break
                rendered++
            }
            encoder.stop()
        }
        muxer.finish()

        val elapsedMs = (System.nanoTime() - startedAt) / 1_000_000
        val verify = readBack(file)
        Logger.i(
            "$TAG RESULT encoder=$name hw=$hw start=$started rendered=$rendered/$FRAMES " +
                "encoded=${encoder.frameCount} elapsedMs=$elapsedMs fileBytes=${file.length()} $verify"
        )
    }

    private fun readBack(file: File): String {
        if (!file.exists() || file.length() < 1024) return "readback=EMPTY"
        return try {
            val mmr = MediaMetadataRetriever()
            mmr.setDataSource(file.absolutePath)
            val duration = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            val width = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
            val height = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
            val rotation = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
            mmr.release()
            "readback=OK durationMs=$duration size=${width}x$height rotation=$rotation"
        } catch (e: Throwable) {
            "readback=FAIL ${e.javaClass.simpleName}: ${e.message}"
        }
    }

    private fun isHardware(info: MediaCodecInfo): Boolean =
        if (Build.VERSION.SDK_INT >= 29) {
            info.isHardwareAccelerated
        } else {
            !info.name.startsWith("c2.android") && !info.name.startsWith("OMX.google")
        }
}
