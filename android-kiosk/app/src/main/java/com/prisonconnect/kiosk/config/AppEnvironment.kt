package com.prisonconnect.kiosk.config

import com.prisonconnect.kiosk.BuildConfig

object AppConfig {
    val baseUrl: String get() = BuildConfig.API_BASE_URL
    val signalingUrl: String get() = signalingUrlOverride ?: BuildConfig.SIGNALING_URL
    var signalingUrlOverride: String? = null
    const val NETWORK_TIMEOUT = 30L // Seconds
    var signalingToken: String? = null
    var deviceAuthorizationEnabled: Boolean = false
}
