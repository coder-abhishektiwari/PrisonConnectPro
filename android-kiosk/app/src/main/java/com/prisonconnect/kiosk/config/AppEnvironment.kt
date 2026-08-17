package com.prisonconnect.kiosk.config

import com.prisonconnect.kiosk.BuildConfig

object AppConfig {

    /** Backend REST gateway (overridable via gradle -P API_BASE_URL). */
    val baseUrl: String get() = BuildConfig.API_BASE_URL

    /** Socket.IO signaling server (overridable via gradle -P SIGNALING_URL). */
    val signalingUrl: String get() = BuildConfig.SIGNALING_URL

    const val NETWORK_TIMEOUT = 30L // Seconds

    /**
     * Room-bound signaling JWT minted by the backend when the call is created.
     * Set right after a successful create-call so the signaling socket can
     * authenticate with role 'kiosk' for exactly this call's room.
     */
    var signalingToken: String? = null

    /** Master switch for device authorization flow.
     *  true  -> full registration/authorization/serial verification
     *  false -> bypass device authorization checks (dev/testing)  */
    var deviceAuthorizationEnabled: Boolean = false
}