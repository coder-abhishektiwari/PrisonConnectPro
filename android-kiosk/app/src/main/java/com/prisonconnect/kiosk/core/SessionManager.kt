package com.prisonconnect.kiosk.core

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.prisonconnect.kiosk.models.auth.AuthToken
import com.prisonconnect.kiosk.models.auth.KioskInfo
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "kiosk_session")

/**
 * SessionManager - Persistent session storage for the kiosk.
 *
 * Stores auth tokens, verified kiosk info, and current user profile
 * in DataStore so sessions survive app restarts.
 */
@Singleton
class SessionManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private val KEY_ACCESS_TOKEN = stringPreferencesKey("access_token")
        private val KEY_REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        private val KEY_TOKEN_EXPIRES_IN = longPreferencesKey("token_expires_in")
        private val KEY_TOKEN_STORED_AT = longPreferencesKey("token_stored_at")

        private val KEY_KIOSK_ID = stringPreferencesKey("kiosk_id")
        private val KEY_KIOSK_SERIAL = stringPreferencesKey("kiosk_serial")
        private val KEY_KIOSK_PRISON_ID = stringPreferencesKey("kiosk_prison_id")
        private val KEY_KIOSK_PRISON_NAME = stringPreferencesKey("kiosk_prison_name")
        private val KEY_KIOSK_STATUS = stringPreferencesKey("kiosk_status")
        private val KEY_KIOSK_LOCATION = stringPreferencesKey("kiosk_location")
        private val KEY_KIOSK_IP = stringPreferencesKey("kiosk_ip")
        private val KEY_KIOSK_AUTHORIZED = booleanPreferencesKey("kiosk_authorized")

        private val KEY_ADMIN_ID = stringPreferencesKey("admin_id")
        private val KEY_ADMIN_EMPLOYEE_ID = stringPreferencesKey("admin_employee_id")
        private val KEY_ADMIN_NAME = stringPreferencesKey("admin_name")
        private val KEY_ADMIN_EMAIL = stringPreferencesKey("admin_email")
        private val KEY_ADMIN_ROLE = stringPreferencesKey("admin_role")

        private val KEY_INMATE_ID = stringPreferencesKey("inmate_id")
        private val KEY_INMATE_NAME = stringPreferencesKey("inmate_name")

        private val KEY_REGISTRATION_STATUS = stringPreferencesKey("registration_status")
        private val KEY_REGISTRATION_REQUEST_ID = stringPreferencesKey("registration_request_id")
        private val KEY_REGISTERED_PRISON_ID = stringPreferencesKey("registered_prison_id")

        private const val ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000L // 1 hour
    }

    // ==================== TOKEN MANAGEMENT ====================

    /**
     * Save auth tokens to persistent storage.
     */
    suspend fun saveTokens(token: AuthToken) {
        context.dataStore.edit { prefs ->
            prefs[KEY_ACCESS_TOKEN] = token.accessToken
            prefs[KEY_REFRESH_TOKEN] = token.refreshToken
            prefs[KEY_TOKEN_EXPIRES_IN] = token.expiresIn
            prefs[KEY_TOKEN_STORED_AT] = System.currentTimeMillis()
        }
    }

    /**
     * Get the current access token, or null if not logged in.
     */
    suspend fun getAccessToken(): String? =
        context.dataStore.data.first()[KEY_ACCESS_TOKEN]

    /**
     * Get the current refresh token, or null if not logged in.
     */
    suspend fun getRefreshToken(): String? =
        context.dataStore.data.first()[KEY_REFRESH_TOKEN]

    /**
     * Check if a valid session exists.
     */
    suspend fun hasValidSession(): Boolean {
        val prefs = context.dataStore.data.first()
        val accessToken = prefs[KEY_ACCESS_TOKEN] ?: return false
        val refreshToken = prefs[KEY_REFRESH_TOKEN] ?: return false
        if (accessToken.isNullOrBlank() || refreshToken.isNullOrBlank()) return false

        // Check if token is expired
        val storedAt = prefs[KEY_TOKEN_STORED_AT] ?: 0L
        val expiresIn = prefs[KEY_TOKEN_EXPIRES_IN] ?: 3600L
        val expiresAt = storedAt + (expiresIn * 1000)
        return System.currentTimeMillis() < expiresAt
    }

    /**
     * Check if a session exists (even if expired - for refresh attempt).
     */
    suspend fun hasSession(): Boolean {
        val prefs = context.dataStore.data.first()
        return !prefs[KEY_ACCESS_TOKEN].isNullOrBlank() &&
            !prefs[KEY_REFRESH_TOKEN].isNullOrBlank()
    }

    /**
     * Clear all session data (logout).
     */
    suspend fun clearSession() {
        context.dataStore.edit { prefs ->
            prefs.clear()
        }
    }

    /**
     * Clear only auth tokens — keep kiosk registration info.
     */
    suspend fun clearAuthOnly() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_ACCESS_TOKEN)
            prefs.remove(KEY_REFRESH_TOKEN)
            prefs.remove(KEY_TOKEN_EXPIRES_IN)
            prefs.remove(KEY_TOKEN_STORED_AT)
            prefs.remove(KEY_ADMIN_ID)
            prefs.remove(KEY_ADMIN_EMPLOYEE_ID)
            prefs.remove(KEY_ADMIN_NAME)
            prefs.remove(KEY_ADMIN_EMAIL)
            prefs.remove(KEY_ADMIN_ROLE)
            prefs.remove(KEY_INMATE_ID)
            prefs.remove(KEY_INMATE_NAME)
        }
    }

    // ==================== KIOSK INFO ====================

    /**
     * Save verified kiosk info.
     */
    suspend fun saveKioskInfo(kiosk: KioskInfo) {
        context.dataStore.edit { prefs ->
            prefs[KEY_KIOSK_ID] = kiosk.kioskId
            prefs[KEY_KIOSK_SERIAL] = kiosk.deviceSerialNumber
            prefs[KEY_KIOSK_PRISON_ID] = kiosk.prisonId ?: ""
            prefs[KEY_KIOSK_PRISON_NAME] = kiosk.prisonName ?: ""
            prefs[KEY_KIOSK_STATUS] = kiosk.status
            prefs[KEY_KIOSK_LOCATION] = kiosk.location ?: ""
            prefs[KEY_KIOSK_IP] = kiosk.ipAddress ?: ""
            prefs[KEY_KIOSK_AUTHORIZED] = kiosk.authorized
        }
    }

    /**
     * Get the verified kiosk info, or null.
     */
    suspend fun getKioskInfo(): KioskInfo? {
        val prefs = context.dataStore.data.first()
        val kioskId = prefs[KEY_KIOSK_ID] ?: return null
        if (kioskId.isNullOrBlank()) return null

        return KioskInfo(
            kioskId = kioskId,
            deviceSerialNumber = prefs[KEY_KIOSK_SERIAL] ?: "",
            prisonId = prefs[KEY_KIOSK_PRISON_ID]?.takeIf { !it.isNullOrBlank() },
            prisonName = prefs[KEY_KIOSK_PRISON_NAME]?.takeIf { !it.isNullOrBlank() },
            status = prefs[KEY_KIOSK_STATUS] ?: "authorized",
            authorized = prefs[KEY_KIOSK_AUTHORIZED] ?: false,
            location = prefs[KEY_KIOSK_LOCATION]?.takeIf { !it.isNullOrBlank() },
            ipAddress = prefs[KEY_KIOSK_IP]?.takeIf { !it.isNullOrBlank() }
        )
    }

    /**
     * Observable flow of whether the device is authorized.
     */
    val isDeviceAuthorized: Flow<Boolean> = context.dataStore.data
        .map { prefs -> prefs[KEY_KIOSK_AUTHORIZED] ?: false }

    // ==================== ADMIN PROFILE ====================

    /**
     * Save the current admin profile.
     */
    suspend fun saveAdminProfile(admin: AdminProfile) {
        context.dataStore.edit { prefs ->
            prefs[KEY_ADMIN_ID] = admin.adminId
            prefs[KEY_ADMIN_EMPLOYEE_ID] = admin.employeeId
            prefs[KEY_ADMIN_NAME] = admin.name
            prefs[KEY_ADMIN_EMAIL] = admin.email
            prefs[KEY_ADMIN_ROLE] = admin.role
        }
    }

    /**
     * Get the current admin profile, or null.
     */
    suspend fun getAdminProfile(): AdminProfile? {
        val prefs = context.dataStore.data.first()
        val adminId = prefs[KEY_ADMIN_ID] ?: return null
        if (adminId.isNullOrBlank()) return null

        return AdminProfile(
            adminId = adminId,
            employeeId = prefs[KEY_ADMIN_EMPLOYEE_ID] ?: "",
            name = prefs[KEY_ADMIN_NAME] ?: "",
            email = prefs[KEY_ADMIN_EMAIL] ?: "",
            role = prefs[KEY_ADMIN_ROLE] ?: "admin",
            permissions = emptyList(),
            status = "active"
        )
    }

    // ==================== INMATE PROFILE ====================

    /**
     * Save the current inmate profile.
     */
    suspend fun saveInmateProfile(inmate: InmateProfile) {
        context.dataStore.edit { prefs ->
            prefs[KEY_INMATE_ID] = inmate.inmateId
            prefs[KEY_INMATE_NAME] = "${inmate.firstName} ${inmate.lastName}"
        }
    }

    /**
     * Get the current inmate ID, or null.
     */
    suspend fun getInmateId(): String? =
        context.dataStore.data.first()[KEY_INMATE_ID]

    /**
     * Get the current inmate name, or null.
     */
    suspend fun getInmateName(): String? =
        context.dataStore.data.first()[KEY_INMATE_NAME]

    // ==================== OBSERVABLE STATE ====================

    /**
     * Observable flow of whether a session exists.
     */
    val sessionExists: Flow<Boolean> = context.dataStore.data
        .map { prefs ->
            !prefs[KEY_ACCESS_TOKEN].isNullOrBlank() &&
                !prefs[KEY_REFRESH_TOKEN].isNullOrBlank()
        }

    // ==================== KIOSK REGISTRATION MANAGEMENT ====================

    suspend fun saveRegistrationState(status: String, prisonId: String = "", requestId: String = "") {
        context.dataStore.edit { prefs ->
            prefs[KEY_REGISTRATION_STATUS] = status
            if (prisonId.isNotBlank()) prefs[KEY_REGISTERED_PRISON_ID] = prisonId
            if (requestId.isNotBlank()) prefs[KEY_REGISTRATION_REQUEST_ID] = requestId
        }
    }

    suspend fun getRegistrationStatus(): String? =
        context.dataStore.data.first()[KEY_REGISTRATION_STATUS]

    suspend fun getRegistrationRequestId(): String? =
        context.dataStore.data.first()[KEY_REGISTRATION_REQUEST_ID]

    suspend fun getRegisteredPrisonId(): String? =
        context.dataStore.data.first()[KEY_REGISTERED_PRISON_ID]

    suspend fun clearRegistrationState() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_REGISTRATION_STATUS)
            prefs.remove(KEY_REGISTRATION_REQUEST_ID)
            prefs.remove(KEY_REGISTERED_PRISON_ID)
        }
    }
}

