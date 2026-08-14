package com.prisonconnect.kiosk.socket

import com.prisonconnect.kiosk.config.AppConfig
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.network.interceptors.AuthInterceptor
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.engineio.client.transports.WebSocket
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SocketServiceImpl @Inject constructor(
    private val authInterceptor: AuthInterceptor
) : SocketService {

    private var socket: Socket? = null

    override fun connect() {
        if (socket?.connected() == true) return

        try {
            val options = IO.Options.builder()
                .setTransports(arrayOf(WebSocket.NAME))
                .setReconnection(true)
                .setReconnectionAttempts(Int.MAX_VALUE)
                .setReconnectionDelay(1000)
                .setReconnectionDelayMax(5000)
                .setRandomizationFactor(0.5)
                .setTimeout(20000)
                // Authentication
                .setAuth(mapOf("token" to (authInterceptor.getToken() ?: "")))
                .build()

            socket = IO.socket(URI.create(AppConfig.signalingUrl), options)

            socket?.on(Socket.EVENT_CONNECT) {
                Logger.d("Socket connected: ${socket?.id()}")
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Logger.d("Socket disconnected")
            }

            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                Logger.e("Socket connection error: ${args.getOrNull(0)}")
            }

            socket?.connect()
        } catch (e: Exception) {
            Logger.e("Failed to initialize socket", e)
        }
    }

    override fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }

    override fun isConnected(): Boolean = socket?.connected() ?: false

    override fun observeEvents(): Flow<Pair<String, Any>> = callbackFlow {
        val socketInstance = socket ?: run {
            close()
            return@callbackFlow
        }

        val events = listOf(
            "joined", "peer-joined", "peer-left", "new-producer",
            "call-ended", "room-updated", "recording-status", "call-status"
        )

        val listeners = events.associateWith { event ->
            { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    trySend(event to args[0])
                } else {
                    trySend(event to Unit)
                }
            }
        }

        listeners.forEach { (event, listener) ->
            socketInstance.on(event) { args -> listener(args) }
        }

        // Also observe system events if needed
        socketInstance.on(Socket.EVENT_CONNECT) { trySend(Socket.EVENT_CONNECT to Unit) }
        socketInstance.on(Socket.EVENT_DISCONNECT) { trySend(Socket.EVENT_DISCONNECT to Unit) }
        socketInstance.on(Socket.EVENT_CONNECT_ERROR) { args ->
            trySend(Socket.EVENT_CONNECT_ERROR to (args.getOrNull(0) ?: "Unknown error"))
        }

        awaitClose {
            // We don't necessarily want to disconnect the socket when the flow is closed,
            // as multiple collectors might exist or we might want to keep the connection.
            // But we should remove listeners if we want to be clean.
            listeners.forEach { (event, _) ->
                socketInstance.off(event)
            }
            socketInstance.off(Socket.EVENT_CONNECT)
            socketInstance.off(Socket.EVENT_DISCONNECT)
            socketInstance.off(Socket.EVENT_CONNECT_ERROR)
        }
    }

    override fun emit(event: String, vararg args: Any) {
        if (socket?.connected() == true) {
            socket?.emit(event, *args)
        } else {
            Logger.w("Attempted to emit $event while socket is disconnected")
        }
    }

    /**
     * Emit an event with an acknowledgement callback.
     */
    override fun emitWithAck(event: String, payload: Any, callback: (Array<Any>) -> Unit) {
        if (socket?.connected() == true) {
            socket?.emit(event, payload, io.socket.client.Ack { args ->
                callback(args ?: arrayOf())
            })
        } else {
            Logger.w("Attempted to emit $event with ack while socket is disconnected")
            callback(arrayOf())
        }
    }
}
