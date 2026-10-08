package com.prisonconnect.kiosk.hardware

import com.prisonconnect.kiosk.core.Logger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Live state of one RFID card-reading session. */
sealed class RfidReaderState {
    /** No session running. */
    data object Idle : RfidReaderState()

    /** Session active, waiting for a card on the reader. */
    data object Searching : RfidReaderState()

    /** A card was read — UI/session code must consume it (acknowledgeRead). */
    data class CardRead(val token: String) : RfidReaderState()

    /** The reader reported a fault — UI falls back to manual entry. */
    data class Failed(val message: String) : RfidReaderState()
}

/**
 * Single point of contact with the external RFID reader.
 *
 * >>> HARDWARE SWAP: when the reader model is known, change ONLY this file. <<<
 * Implement [startDriver]/[stopDriver] at the bottom: open the reader
 * (USB / serial / HID) and push every detected card number with
 * [onCardRead], faults with [onDriverError]. Nothing else in the app changes:
 * login (LoginViewModel) and registration (BiometricRegistrationViewModel)
 * already consume [state].
 */
@Singleton
class RfidReaderManager @Inject constructor() {

    private val _state = MutableStateFlow<RfidReaderState>(RfidReaderState.Idle)
    val state = _state.asStateFlow()

    /** Begin (or resume) a reading session. Safe to call repeatedly. */
    fun startSession() {
        if (_state.value is RfidReaderState.Searching) return
        _state.value = RfidReaderState.Searching
        Logger.i("RfidReaderManager: session started, waiting for card")
        startDriver()
    }

    /** End the session (screen closed, auth finished, user backed out). */
    fun stopSession() {
        stopDriver()
        _state.value = RfidReaderState.Idle
    }

    /**
     * Re-arm the session after a read was consumed. Keeps [state] emitting so
     * the next tap produces a fresh CardRead event.
     */
    fun acknowledgeRead() {
        if (_state.value is RfidReaderState.CardRead) {
            _state.value = RfidReaderState.Searching
        }
    }

    /** Call from the driver whenever a card number is detected. */
    fun onCardRead(token: String) {
        val cleaned = token.trim()
        if (cleaned.isEmpty()) return
        Logger.i("RfidReaderManager: card read")
        _state.value = RfidReaderState.CardRead(cleaned)
    }

    /** Call from the driver on a read fault — UI shows manual entry. */
    fun onDriverError(message: String) {
        Logger.w("RfidReaderManager: driver error: $message")
        _state.value = RfidReaderState.Failed(message)
    }

    // ================================================================
    // HARDWARE DRIVER HOOK — the ONLY place to change when the external
    // RFID reader model/chip is final. Until then the session stays in
    // Searching and the UI offers manual card-number entry.
    // ================================================================

    private fun startDriver() {
        // TODO(hardware): connect to the reader here (UsbManager / serial /
        // vendor SDK) and stream results:
        //   onCardRead(uid)   on every tap
        //   onDriverError(e)  on faults
    }

    private fun stopDriver() {
        // TODO(hardware): close the reader connection here.
    }
}
