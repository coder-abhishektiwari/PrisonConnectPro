package com.prisonconnect.kiosk.core

import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.InmateRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single source of truth for the jail account balance shown in the kiosk header
 * and on the wallet screen. Starts at 0 and is refreshed from the jail-account
 * API (GET /inmate/wallet/:id). No fake/mock values are ever injected.
 */
@Singleton
class JailBalanceSync @Inject constructor(
    private val inmateRepository: InmateRepository,
    private val authRepository: AuthRepository
) {
    private val _balance = MutableStateFlow(0.0)
    val balance: StateFlow<Double> = _balance.asStateFlow()

    /** Update the shared balance directly (used by the wallet screen after a load). */
    fun push(value: Double) {
        _balance.value = value
    }

    /** Refresh balance from GET /inmate/wallet/:id. Returns true on success. */
    suspend fun refresh(): Boolean {
        val inmateId = authRepository.getInmateId() ?: return false
        if (inmateId.isBlank()) return false
        return try {
            var success = false
            inmateRepository.getWalletStatement(inmateId).collect { result ->
                when (result) {
                    is com.prisonconnect.kiosk.network.NetworkResult.Success -> {
                        _balance.value = result.data.wallet.balance
                        success = true
                    }
                    is com.prisonconnect.kiosk.network.NetworkResult.Failure -> {
                        // Keep last known balance (starts at 0) on failure.
                        success = false
                    }
                    else -> Unit
                }
            }
            success
        } catch (e: Exception) {
            false
        }
    }
}