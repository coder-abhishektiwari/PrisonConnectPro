package com.prisonconnect.kiosk.core

/**
 * Centralized application constants.
 *
 * NOTE: there is deliberately NO build-time kiosk id constant anymore — every
 * kiosk identity is server-issued (via /kiosks/verify after registration).
 * Code that needs a kiosk id must read it from AuthRepository.getVerifiedKiosk()
 * / SessionManager.getKioskInfo() and hard-fail when it is missing.
 */
object Constants {
    /** Logging tag prefix for all kiosk logs. */
    const val LOG_TAG: String = "PrisonKiosk"
}
