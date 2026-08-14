package com.prisonconnect.kiosk.socket

import io.socket.client.Socket
import kotlinx.coroutines.flow.Flow

interface SocketService {
    fun connect()
    fun disconnect()
    fun isConnected(): Boolean

    /**
     * Emits events received from the signaling server.
     */
    fun observeEvents(): Flow<Pair<String, Any>>

    fun emit(event: String, vararg args: Any)

    /**
     * Emit an event with an acknowledgement callback.
     */
    fun emitWithAck(event: String, payload: Any, callback: (Array<Any>) -> Unit)
}