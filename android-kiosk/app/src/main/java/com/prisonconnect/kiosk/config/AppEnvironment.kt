package com.prisonconnect.kiosk.config

object AppConfig {

    val baseUrl: String get() = "https://prisonconnect-backend.onrender.com"

    val signalingUrl: String get() =  "https://prisonconnect-signaling.onrender.com"

    const val NETWORK_TIMEOUT = 30L // Seconds

    /** Master switch for device authorization flow.
     *  true  -> full registration/authorization/serial verification
     *  false -> bypass device authorization checks (dev/testing)  */
    var deviceAuthorizationEnabled: Boolean = true
}
