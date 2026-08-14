package com.prisonconnect.kiosk.network

import com.prisonconnect.kiosk.models.common.ApiError

/**
 * A sealed class representing the state of a network request in the UI.
 */
sealed class NetworkResult<out T> {
    object Idle : NetworkResult<Nothing>()
    object Loading : NetworkResult<Nothing>()

    data class Success<out T>(val data: T) : NetworkResult<T>()

    data class Failure(
        val error: ApiError,
        val statusCode: Int? = null,
        val exception: Throwable? = null
    ) : NetworkResult<Nothing>()
}
