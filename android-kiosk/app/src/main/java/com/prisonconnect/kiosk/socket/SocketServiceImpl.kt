package com.prisonconnect.kiosk.socket

import com.prisonconnect.kiosk.config.AppConfig
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.network.interceptors.AuthInterceptor
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.engineio.client.transports.WebSocket
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SocketServiceImpl @Inject constructor(
    private val authInterceptor: AuthInterceptor
) : SocketService {

    private var socket: Socket? = null
    private var lastAuthToken: String? = null

    // Published whenever a (new) socket instance is created so collectors can
    // attach to the latest connection after token-triggered reconnects.
    private val socketFlow = MutableSharedFlow<Socket>(extraBufferCapacity = 1)

    private fun desiredToken(): String =
        AppConfig.signalingToken ?: (authInterceptor.getToken() ?: "")

    override fun connect() {
        val desired = desiredToken()
        if (socket?.connected() == true && lastAuthToken == desired) return

        // Token changed (e.g. fresh room-bound kiosk signalingToken minted for a
        // new call). The socket.io client must be re-created so the new token is
        // sent on the handshake; otherwise the server sees an old room binding and
        // rejects join-room with FORBIDDEN.
        socket?.disconnect()
        socket?.off()
        socket = null

        try {
            val options = IO.Options.builder()
                .setTransports(arrayOf(WebSocket.NAME))
                .setReconnection(true)
                .setReconnectionAttempts(Int.MAX_VALUE)
                .setReconnectionDelay(1000)
                .setReconnectionDelayMax(5000)
                .setRandomizationFactor(0.5)
                .setTimeout(20000)
                // Authentication — prefer the room-bound kiosk signaling token
                // minted for the active call, falling back to the login token.
                .setAuth(mapOf("token" to desired))
                .build()

            socket = IO.socket(URI.create(AppConfig.signalingUrl), options)
            lastAuthToken = desired

            socket?.let { socketFlow.tryEmit(it) }

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
        val events = listOf(
            "joined", "peer-joined", "peer-left", "new-producer",
            "call-ended", "room-updated", "recording-status", "call-status"
        )

        fun attach(target: Socket) {
            val onEvent: (String) -> (Any?) -> Unit = { event ->
                { args: Any? ->
                    if (args != null) trySend(event to args) else trySend(event to Unit)
                }
            }
            events.forEach { event ->
                target.on(event) { args -> onEvent(event)(args.getOrNull(0)) }
            }
            target.on(Socket.EVENT_CONNECT) { trySend(Socket.EVENT_CONNECT to Unit) }
            target.on(Socket.EVENT_DISCONNECT) { trySend(Socket.EVENT_DISCONNECT to Unit) }
            target.on(Socket.EVENT_CONNECT_ERROR) { args ->
                trySend(Socket.EVENT_CONNECT_ERROR to (args.getOrNull(0) ?: "Unknown error"))
            }
        }

        // Attach to whatever socket exists now...
        socket?.let { attach(it) }
        // ...and to any socket created later (token-triggered reconnect).
        val job = launch {
            socketFlow.collect { s ->
                if (s !== socket) return@collect
                attach(s)
            }
        }

        awaitClose {
            job.cancel()
            // We don't necessarily want to disconnect the socket when the flow is closed,
            // as multiple collectors might exist or we might want to keep the connection.
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
