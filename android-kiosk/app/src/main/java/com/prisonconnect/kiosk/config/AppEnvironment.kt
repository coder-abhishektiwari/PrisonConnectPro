package com.prisonconnect.kiosk.config

enum class Environment {
    MOCK,
    DEV,
    STAGING,
    PRODUCTION
}

object AppConfig {
    var environment: Environment = Environment.PRODUCTION

    val baseUrl: String
        get() = when (environment) {
            Environment.MOCK -> "https://prisonconnect-mockbackend.onrender.com/"
            Environment.DEV -> "https://dev-api.prisonconnect.internal/"
            Environment.STAGING -> "https://staging-api.prisonconnect.internal/"
            Environment.PRODUCTION -> "https://prisonconnect-mockbackend.onrender.com/"
        }

    val signalingUrl: String
        get() = when (environment) {
            Environment.MOCK -> "https://prisonconnect-mockbackend.onrender.com/"
            Environment.DEV -> "wss://dev-signaling.prisonconnect.internal"
            Environment.STAGING -> "wss://staging-signaling.prisonconnect.internal"
            Environment.PRODUCTION -> "wss://signaling.prisonconnect.gov.in"
        }

    const val NETWORK_TIMEOUT = 30L // Seconds

    /** Master switch for device authorization flow.
     *  true  -> full registration/authorization/serial verification
     *  false -> bypass device authorization checks (dev/testing)  */
    var deviceAuthorizationEnabled: Boolean = true
}
