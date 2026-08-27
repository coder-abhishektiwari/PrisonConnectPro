package com.prisonconnect.kiosk.datasource.remote

import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.core.ApiCache
import com.prisonconnect.kiosk.datasource.InmateDataSource
import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.models.wallet.WalletStatement
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteInmateDataSource @Inject constructor(
    private val apiService: TrustApiService,
    private val cache: ApiCache
) : InmateDataSource {
    override suspend fun getProfile(id: String): ApiResponse<InmateProfile> =
        cache.getOrFetch("inmate:profile:$id") { apiService.getInmateProfile(id) }

    override suspend fun getBalance(id: String): ApiResponse<InmateBalance> =
        cache.getOrFetch("inmate:balance:$id") { apiService.getInmateBalance(id) }

    override suspend fun getWalletStatement(id: String): ApiResponse<WalletStatement> =
        cache.getOrFetch("inmate:wallet:$id") { apiService.getWalletStatement(id) }
}
