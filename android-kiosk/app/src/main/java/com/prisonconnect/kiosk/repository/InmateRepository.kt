package com.prisonconnect.kiosk.repository

import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.models.wallet.WalletRequest
import com.prisonconnect.kiosk.models.wallet.WalletStatement
import com.prisonconnect.kiosk.network.NetworkResult
import kotlinx.coroutines.flow.Flow

interface InmateRepository {
    fun getProfile(id: String): Flow<NetworkResult<InmateProfile>>
    fun getBalance(id: String): Flow<NetworkResult<InmateBalance>>
    fun getWalletStatement(id: String): Flow<NetworkResult<WalletStatement>>
    /** Any previously cached statement (even stale) for instant paint; null if none. */
    fun peekWalletStatement(id: String): WalletStatement?
    fun requestBalance(amount: Int, note: String? = null): Flow<NetworkResult<WalletRequest>>
}
