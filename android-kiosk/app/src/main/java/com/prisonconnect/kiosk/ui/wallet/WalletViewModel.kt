package com.prisonconnect.kiosk.ui.wallet

import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.JailBalanceSync
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.wallet.WalletStatement
import com.prisonconnect.kiosk.models.wallet.WalletTransaction
import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.InmateRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class WalletViewModel @Inject constructor(
    private val inmateRepository: InmateRepository,
    private val authRepository: AuthRepository,
    private val jailBalanceSync: JailBalanceSync
) : BaseViewModel() {

    private val _walletState = MutableStateFlow<UiState<WalletUiData>>(UiState.Loading)
    val walletState = _walletState.asStateFlow()

    private val _requestState = MutableStateFlow(RequestState())
    val requestState = _requestState.asStateFlow()

    init {
        loadWallet()
    }

    /** One-shot "request balance" dialog state: submit progress, error, success. */
    data class RequestState(
        val submitting: Boolean = false,
        val error: String? = null,
        val successMessage: String? = null
    )

    fun requestBalance(amount: Int) {
        if (_requestState.value.submitting) return
        _requestState.value = RequestState(submitting = true)
        viewModelScope.launch {
            inmateRepository.requestBalance(amount).collect { result ->
                when (result) {
                    is com.prisonconnect.kiosk.network.NetworkResult.Success -> {
                        val rupees = String.format("%.2f", result.data.amount)
                        _requestState.value = RequestState(
                            successMessage = "Request sent for \u20B9$rupees - the warden will review it"
                        )
                        loadWallet()
                    }
                    is com.prisonconnect.kiosk.network.NetworkResult.Failure -> {
                        _requestState.value = RequestState(error = result.error.message)
                    }
                    else -> Unit
                }
            }
        }
    }

    fun clearRequestEvent() {
        _requestState.value = RequestState()
    }

    fun loadWallet() {
        viewModelScope.launch {
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            if (inmateId.isNullOrBlank() || inmateId == Constants.KIOSK_ID) {
                _walletState.value = UiState.Error("No active session found. Please login again.")
                return@launch
            }

            // Stale-while-revalidate: paint any previously loaded statement
            // instantly instead of blocking the screen on a spinner, then
            // refresh in the background (a fresh cache read is also instant).
            val cached = inmateRepository.peekWalletStatement(inmateId)
            if (cached != null) {
                jailBalanceSync.push(cached.wallet.balance)
                _walletState.value = UiState.Success(cached.toUiData())
            } else {
                _walletState.value = UiState.Loading
            }

            inmateRepository.getWalletStatement(inmateId).collect { result ->
                when (result) {
                    is com.prisonconnect.kiosk.network.NetworkResult.Success -> {
                        jailBalanceSync.push(result.data.wallet.balance)
                        _walletState.value = UiState.Success(result.data.toUiData())
                    }
                    is com.prisonconnect.kiosk.network.NetworkResult.Failure -> {
                        // Never blank out data that is already on screen; only
                        // surface the error when there is nothing to show.
                        if (_walletState.value !is UiState.Success) {
                            _walletState.value = UiState.Error(result.error?.message ?: "Failed to load wallet")
                        }
                    }
                    else -> Unit
                }
            }
        }
    }

    private fun WalletStatement.toUiData() = WalletUiData(
        balance = wallet.balance,
        currency = wallet.currency,
        lastRecharge = wallet.lastRecharge,
        lastRechargeAmount = wallet.lastRechargeAmount,
        transactions = transactions
            .filter { it.isSettled }
            .sortedByDescending { it.timestamp }
    )

    data class WalletUiData(
        val balance: Double,
        val currency: String,
        val lastRecharge: String? = null,
        val lastRechargeAmount: Double? = null,
        val transactions: List<WalletTransaction>
    )
}