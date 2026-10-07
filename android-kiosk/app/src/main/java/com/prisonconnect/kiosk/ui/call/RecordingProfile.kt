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
        val LIGHT = RecordingProfile("light", 540, 960, 12, 350_000, 64_000)

        /** ~24 MB per 5 minutes — default. */
        val BALANCED = RecordingProfile("balanced", 720, 1280, 15, 600_000, 64_000)

        /** ~39 MB per 5 minutes. */
        val HIGH = RecordingProfile("high", 720, 1280, 30, 1_000_000, 64_000)

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
