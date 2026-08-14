package com.prisonconnect.kiosk.core

sealed interface Result<out T> {
    data class Success<T>(val data: T) : Result<T>
    data class Error(val message: String, val throwable: Throwable? = null) : Result<Nothing>
    data object Loading : Result<Nothing>

    companion object {
        fun <T> success(data: T): Result<T> = Success(data)
        fun error(message: String, throwable: Throwable? = null): Result<Nothing> = Error(message, throwable)
        fun loading(): Result<Nothing> = Loading
    }
}
