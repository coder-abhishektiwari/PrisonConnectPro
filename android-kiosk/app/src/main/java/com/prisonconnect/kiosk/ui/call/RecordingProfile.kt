package com.prisonconnect.kiosk.ui.call

/**
 * Quality/size profile for the kiosk-side call recording.
 *
 * The kiosk captures portrait video, so sizes are height-first (e.g. 720p
 * portrait = 720x1280). Values come from the warden dashboard's settings
 * (`recordingProfile`) with [BALANCED] as the fallback.
 */
data class RecordingProfile(
    val name: String,
    val width: Int,
    val height: Int,
    val fps: Int,
    val videoBitrate: Int,
    val audioBitrate: Int
) {
    companion object {
        /** ~14 MB per 5 minutes. */
        val LIGHT = RecordingProfile("light", 540, 960, 12, 450_000, 64_000)

        /** ~45 MB per 5 minutes — default. Bitrate sized so the hardware
         *  encoder does not drop frames to hold the rate at 720p15. */
        val BALANCED = RecordingProfile("balanced", 720, 1280, 15, 1_200_000, 64_000)

        /** ~94 MB per 5 minutes. */
        val HIGH = RecordingProfile("high", 720, 1280, 30, 2_500_000, 64_000)

        /** Profile applied to the next recording; refreshed from settings. */
        @Volatile
        var current: RecordingProfile = BALANCED

        /** Maps the `recordingProfile` setting to a profile, or null to keep the current one. */
        fun fromSetting(value: String?): RecordingProfile? = when (value?.trim()?.lowercase()) {
            "light", "low", "small" -> LIGHT
            "balanced", "medium", "normal" -> BALANCED
            "high", "full", "max" -> HIGH
            else -> null
        }
    }
}
