package com.prisonconnect.kiosk.datasource

import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.models.wallet.WalletRequest
import com.prisonconnect.kiosk.models.wallet.WalletRequestPayload
import com.prisonconnect.kiosk.models.wallet.WalletStatement

interface InmateDataSource {
    suspend fun getProfile(id: String): ApiResponse<InmateProfile>
    suspend fun getBalance(id: String): ApiResponse<InmateBalance>
    suspend fun getWalletStatement(id: String): ApiResponse<WalletStatement>
    /** Any previously cached statement (even stale) for instant paint; null if none. */
    fun peekWalletStatement(id: String): WalletStatement?
    suspend fun requestWalletBalance(request: WalletRequestPayload): ApiResponse<WalletRequest>
}
