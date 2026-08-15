package com.prisonconnect.kiosk.repository

import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.models.wallet.WalletStatement
import com.prisonconnect.kiosk.network.NetworkResult
import kotlinx.coroutines.flow.Flow

interface InmateRepository {
    fun getProfile(id: String): Flow<NetworkResult<InmateProfile>>
    fun getBalance(id: String): Flow<NetworkResult<InmateBalance>>
    fun getWalletStatement(id: String): Flow<NetworkResult<WalletStatement>>
}
