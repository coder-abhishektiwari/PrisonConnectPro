package com.prisonconnect.kiosk.datasource

import com.prisonconnect.kiosk.models.common.ApiResponse
import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile

interface InmateDataSource {
    suspend fun getProfile(id: String): ApiResponse<InmateProfile>
    suspend fun getBalance(id: String): ApiResponse<InmateBalance>
}
