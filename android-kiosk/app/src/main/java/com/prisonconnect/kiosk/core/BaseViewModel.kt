package com.prisonconnect.kiosk.core

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Base ViewModel providing common UI state handling and coroutine launching.
 */
abstract class BaseViewModel : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<Unit>>(UiState.Idle)
    val uiState: StateFlow<UiState<Unit>> = _uiState.asStateFlow()

    protected fun setIdle() {
        _uiState.value = UiState.Idle
    }

    protected fun setLoading() {
        _uiState.value = UiState.Loading
    }

    protected fun setSuccess() {
        _uiState.value = UiState.Success(Unit)
    }

    protected fun setError(message: String) {
        _uiState.value = UiState.Error(message)
    }

    /**
     * Launches a coroutine on the main dispatcher with error handling.
     */
    protected fun launch(
        dispatcher: CoroutineDispatcher = Dispatchers.Main,
        block: suspend () -> Unit
    ) {
        viewModelScope.launch(dispatcher) {
            try {
                block()
            } catch (e: Exception) {
                Logger.e("Unhandled error in ${this@BaseViewModel::class.simpleName}", e)
                setError(e.message ?: "Unexpected error")
            }
        }
    }
}
