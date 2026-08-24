package com.prisonconnect.kiosk.ui.call

/**
 * Bridge so [CallEngine] and screens can read the current call's backend id
 * without changing every navigation signature.
 */
object AppConfigBridge {
    @Volatile var lastCallId: String? = null
}
