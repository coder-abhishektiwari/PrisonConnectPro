package com.prisonconnect.kiosk.network.interceptors

import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.core.SessionManager
import com.prisonconnect.kiosk.models.auth.AuthToken
import com.prisonconnect.kiosk.models.auth.RefreshTokenRequest
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/**
 * Interceptor to attach Authorization headers to outgoing requests and
 * transparently refresh an expired access token on 401.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val sessionManager: SessionManager,
    private val apiServiceProvider: Provider<TrustApiService>
) : Interceptor {

    // In-memory cache for fast access (avoids DataStore read on every request)
    @Volatile
    private var cachedToken: String? = null

    private val refreshMutex = Mutex()

    /**
     * Set the auth token (called after login/refresh).
     */
    fun setToken(token: String?) {
        cachedToken = token
    }

    /**
     * Get the current auth token.
     */
    fun getToken(): String? = cachedToken

    /**
     * Load the token from persistent storage (called at app startup).
     */
    fun loadTokenFromStorage() {
        cachedToken = runBlocking { sessionManager.getAccessToken() }
    }

    /**
     * Clear the cached token (called on logout).
     */
    fun clearToken() {
        cachedToken = null
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Ensure we have a token loaded
        if (cachedToken == null) {
            loadTokenFromStorage()
        }

        val token = cachedToken
        val requestBuilder = originalRequest.newBuilder()

        // Add Authorization header if token exists
        if (!token.isNullOrBlank()) {
            requestBuilder.header("Authorization", "Bearer $token")
        }

        // Add X-Admin-ID header for admin profile requests
        val adminId = runBlocking { sessionManager.getAdminProfile()?.adminId }
        if (!adminId.isNullOrBlank()) {
            requestBuilder.header("X-Admin-ID", adminId)
        }

        var response = chain.proceed(requestBuilder.build())

        if (response.code == 401 && !isAuthRefreshRequest(originalRequest)) {
            response.close()
            val freshToken = runBlocking { refreshAccessToken() }
            if (freshToken != null) {
                val retryBuilder = originalRequest.newBuilder()
                    .header("Authorization", "Bearer $freshToken")
                val retryAdminId = runBlocking { sessionManager.getAdminProfile()?.adminId }
                if (!retryAdminId.isNullOrBlank()) {
                    retryBuilder.header("X-Admin-ID", retryAdminId)
                }
                response = chain.proceed(retryBuilder.build())
            }
        }

        return response
    }

    /**
     * Refresh the access token (serialized so concurrent 401s trigger a single refresh).
     */
    private suspend fun refreshAccessToken(): String? = refreshMutex.withLock {
        // Another request may have already refreshed the token while we waited.
        val current = cachedToken
        if (!current.isNullOrBlank() && isTokenStillValid(current)) {
            return@withLock current
        }

        val refreshToken = sessionManager.getRefreshToken()
        if (refreshToken.isNullOrBlank()) {
            Logger.w("AuthInterceptor: No refresh token - cannot refresh session")
            clearToken()
            return@withLock null
        }

        val response = try {
            apiServiceProvider.get().refreshToken(RefreshTokenRequest(refreshToken))
        } catch (e: Exception) {
            Logger.w("AuthInterceptor: Token refresh request failed: ${e.message}")
            null
        }

        val newToken: AuthToken? = response?.data
        if (newToken != null) {
            sessionManager.saveTokens(newToken)
            cachedToken = newToken.accessToken
            Logger.i("AuthInterceptor: Access token refreshed")
            return@withLock cachedToken
        }

        val errorCode = response?.error?.code
        if (errorCode == "UNAUTHORIZED" || errorCode == "INVALID_REFRESH_TOKEN" || errorCode == "INVALID_TOKEN") {
            Logger.w("AuthInterceptor: Refresh token rejected ($errorCode) - clearing session")
            sessionManager.clearSession()
            clearToken()
        }

        null
    }

    private fun isAuthRefreshRequest(request: Request): Boolean {
        val segments = request.url.pathSegments
        return segments.size >= 2 &&
            segments[segments.size - 2] == "auth" &&
            segments.last() == "refresh"
    }

    private fun isTokenStillValid(token: String): Boolean {
        val parts = token.split(".")
        if (parts.size != 3) return false
        val payload = try {
            val padded = parts[1].replace('-', '+').replace('_', '/')
            val b64 = padded.padEnd((padded.length + 3) / 4 * 4, '=')
            String(android.util.Base64.decode(b64, android.util.Base64.DEFAULT))
        } catch (e: Exception) {
            return false
        }
        val exp = Regex("\"exp\"\\s*:\\s*(\\d+)").find(payload)
            ?.groupValues?.get(1)
            ?.toLongOrNull()
            ?: return false
        return exp * 1000 > System.currentTimeMillis()
    }
}