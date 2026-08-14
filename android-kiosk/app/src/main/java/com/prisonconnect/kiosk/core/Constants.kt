package com.prisonconnect.kiosk.core

import com.prisonconnect.kiosk.BuildConfig

/**
 * Centralized application constants.
 */
object Constants {
    /** Unique identifier of this kiosk device (from local.properties). */
    val KIOSK_ID: String = if (BuildConfig.KIOSK_ID == "null") "KIOSK-UNSET" else BuildConfig.KIOSK_ID

    /** Base URL of the Prison Trust Account API Gateway. */
    val TRUST_API_HOST: String = BuildConfig.TRUST_API_HOST

    /** Base URL of the Node.js signaling server (WebRTC signaling). */
    const val SIGNALING_SERVER_URL: String = "https://signaling.prisonconnect.internal"

    /** Default network request timeout in seconds. */
    const val NETWORK_TIMEOUT_SECONDS: Long = 30L

    /** Maximum allowed call duration in minutes (enforced by backend). */
    const val MAX_CALL_DURATION_MINUTES: Int = 30

    /** Logging tag prefix for all kiosk logs. */
    const val LOG_TAG: String = "PrisonKiosk"
}
