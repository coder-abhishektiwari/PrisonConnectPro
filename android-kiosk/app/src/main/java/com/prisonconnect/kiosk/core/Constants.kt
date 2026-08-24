package com.prisonconnect.kiosk.core

import com.prisonconnect.kiosk.BuildConfig

/**
 * Centralized application constants.
 */
object Constants {
    /** Unique identifier of this kiosk device (from local.properties). */
    val KIOSK_ID: String = if (BuildConfig.KIOSK_ID == "null") "KIOSK-UNSET" else BuildConfig.KIOSK_ID

    /** Base URL of the Node.js signaling server (WebRTC signaling). */
    const val SIGNALING_SERVER_URL: String = "http://10.15.246.69:3002"

    /** Logging tag prefix for all kiosk logs. */
    const val LOG_TAG: String = "PrisonKiosk"
}
