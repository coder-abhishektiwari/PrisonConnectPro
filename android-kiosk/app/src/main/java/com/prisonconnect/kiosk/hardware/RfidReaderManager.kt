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

    /**
     * Tag of the screen that currently owns the reader ("Login",
     * "AddPrisoner", "InmateBiometrics"). A screen can only stop the
     * session it owns — a late dispose from a screen that already lost the
     * session can never kill the next screen's live read.
     */
    @Volatile
    private var sessionOwner: String? = null

    /**
     * Begin (or resume) a reading session owned by [owner] (a stable screen
     * tag). If another screen still owns the reader — or a stale session
     * was left running — the old driver is force-stopped and the port is
     * closed FIRST, then a clean, fresh session starts for [owner]. Safe to
     * call repeatedly from the same screen.
     */
    fun startSession(owner: String) {
        val previousOwner = sessionOwner
        if (previousOwner != null && previousOwner != owner) {
            Logger.i("RfidReaderManager: taking over from '$previousOwner' for '$owner' — releasing stale session")
            stopDriver()
            _state.value = RfidReaderState.Idle
        } else if (_state.value is RfidReaderState.Searching) {
            return
        }
        sessionOwner = owner
        _state.value = RfidReaderState.Searching
        Logger.i("RfidReaderManager: session started (owner=$owner), waiting for card")
        startDriver()
    }

    /**
     * End the session. Only stops if [owner] still owns it — a delayed
     * [stopSession] from a screen that already yielded the reader becomes a
     * no-op and cannot wedge the new screen's session.
     */
    fun stopSession(owner: String? = null) {
        val currentOwner = sessionOwner
        if (owner != null && currentOwner != null && currentOwner != owner) {
            Logger.d("RfidReaderManager: stopSession('$owner') ignored — session owned by '$currentOwner'")
            return
        }
        stopDriver()
        sessionOwner = null
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
    //
    // LIFECYCLE CONTRACT (strict): the reader port may be opened ONLY
    // inside startDriver and MUST be fully released inside stopDriver —
    // close the USB/serial/HID connection and unbind listeners. stopDriver
    // is invoked on every takeover (startSession from a new screen
    // force-closes the previous session first) and on every screen exit.
    // ================================================================

    private fun startDriver() {
        // TODO(hardware): connect to the reader here (UsbManager / serial /
        // vendor SDK) and stream results:
        //   onCardRead(uid)   on every tap
        //   onDriverError(e)  on faults
    }

    private fun stopDriver() {
        // TODO(hardware): close the reader connection / unbind listeners
        // here. Must be safe to call even when nothing is open.
    }
}
