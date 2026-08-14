package com.prisonconnect.kiosk.datasource.remote

import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.datasource.InmateDataSource
import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteInmateDataSource @Inject constructor(
    private val apiService: TrustApiService
) : InmateDataSource {
    override suspend fun getProfile(id: String): ApiResponse<InmateProfile> =
        apiService.getInmateProfile(id)

    override suspend fun getBalance(id: String): ApiResponse<InmateBalance> =
        apiService.getInmateBalance(id)
}
