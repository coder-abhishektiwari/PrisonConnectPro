package com.prisonconnect.kiosk.network.interceptors

import com.prisonconnect.kiosk.core.SessionManager
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Interceptor to attach Authorization headers to outgoing requests.
 * Uses SessionManager for persistent token storage.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val sessionManager: SessionManager
) : Interceptor {

    // In-memory cache for fast access (avoids DataStore read on every request)
    @Volatile
    private var cachedToken: String? = null

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

        val authenticatedRequest = requestBuilder.build()
        return chain.proceed(authenticatedRequest)
    }
}
