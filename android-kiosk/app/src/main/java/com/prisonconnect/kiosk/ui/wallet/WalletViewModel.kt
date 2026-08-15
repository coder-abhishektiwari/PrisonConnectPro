package com.prisonconnect.kiosk.ui.wallet

import androidx.lifecycle.viewModelScope
import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.JailBalanceSync
import com.prisonconnect.kiosk.core.UiState
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

    init {
        loadWallet()
    }

    fun loadWallet() {
        viewModelScope.launch {
            _walletState.value = UiState.Loading
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            if (inmateId.isNullOrBlank() || inmateId == Constants.KIOSK_ID) {
                _walletState.value = UiState.Error("No active session found. Please login again.")
                return@launch
            }

            inmateRepository.getWalletStatement(inmateId).collect { result ->
                when (result) {
                    is com.prisonconnect.kiosk.network.NetworkResult.Success -> {
                        val statement = result.data
                        val transactions = statement.transactions
                            .filter { it.status.equals("success", ignoreCase = true) || it.status.equals("completed", ignoreCase = true) }
                            .sortedByDescending { it.timestamp }
                        jailBalanceSync.push(statement.wallet.balance)
                        _walletState.value = UiState.Success(
                            WalletUiData(
                                balance = statement.wallet.balance,
                                currency = statement.wallet.currency,
                                totalDeducted = transactions.filter { it.isDebit }.sumOf { it.amount },
                                transactions = transactions
                            )
                        )
                    }
                    is com.prisonconnect.kiosk.network.NetworkResult.Failure -> {
                        _walletState.value = UiState.Error(result.error.message ?: "Failed to load wallet")
                    }
                    else -> Unit
                }
            }
        }
    }

    data class WalletUiData(
        val balance: Double,
        val currency: String,
        val totalDeducted: Double,
        val transactions: List<WalletTransaction>
    )
}