package com.prisonconnect.kiosk.datasource

import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.models.wallet.WalletStatement

interface InmateDataSource {
    suspend fun getProfile(id: String): ApiResponse<InmateProfile>
    suspend fun getBalance(id: String): ApiResponse<InmateBalance>
    suspend fun getWalletStatement(id: String): ApiResponse<WalletStatement>
}
