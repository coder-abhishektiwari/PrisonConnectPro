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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SocketServiceImpl @Inject constructor(
    private val authInterceptor: AuthInterceptor
) : SocketService {

    private var socket: Socket? = null
    private var lastAuthToken: String? = null
    private var connectLatch: CountDownLatch? = null

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

            // Fresh latch for THIS socket instance. Any stallered emits (e.g.
            // join-room fired before the websocket handshake finished) wait on
            // it and then retry once the connection is live.
            val latch = CountDownLatch(1)
            connectLatch = latch

            socket?.on(Socket.EVENT_CONNECT) {
                Logger.d("Socket connected: ${socket?.id()}")
                latch.countDown()
                connectLatch = null
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

        // Block the caller until the socket is actually connected (or 25s give
        // up) so that room-signaling emits queued right after connect() are not
        // dropped. Runs on a background thread to avoid blocking the main
        // thread while the websocket handshake (and optional Render cold start)
        // completes.
        val latch = connectLatch ?: return
        val s = socket
        val token = desired
        Thread {
            try {
                latch.await(25, TimeUnit.SECONDS)
                if (s?.connected() != true || token != lastAuthToken) {
                    Logger.w("Socket did not become ready in time for signaling emit")
                }
            } catch (e: Exception) {
                Logger.e("Error waiting for socket connect", e)
            }
        }.start()
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
     *
     * If the socket is not connected yet (e.g. join-room fired immediately
     * after connect() during a cold Render start), defers the emit to a
     * background thread until the connection is ready, then retries.
     */
    override fun emitWithAck(event: String, payload: Any, callback: (Array<Any>) -> Unit) {
        if (socket?.connected() == true) {
            directEmitWithAck(event, payload, callback)
            return
        }

        val latch = connectLatch
        val s = socket
        if (latch != null && s != null) {
            Thread {
                try {
                    latch.await(25, TimeUnit.SECONDS)
                } catch (e: Exception) {
                    Logger.e("Error waiting for socket before $event", e)
                }
                if (s.connected()) {
                    directEmitWithAck(event, payload, callback)
                } else {
                    Logger.w("Socket never became ready; dropping $event")
                    callback(arrayOf())
                }
            }.start()
        } else {
            Logger.w("Attempted to emit $event with ack while socket is disconnected")
            callback(arrayOf())
        }
    }

    private fun directEmitWithAck(event: String, payload: Any, callback: (Array<Any>) -> Unit) {
        socket?.emit(event, payload, io.socket.client.Ack { args ->
            callback(args ?: arrayOf())
        })
    }
}
