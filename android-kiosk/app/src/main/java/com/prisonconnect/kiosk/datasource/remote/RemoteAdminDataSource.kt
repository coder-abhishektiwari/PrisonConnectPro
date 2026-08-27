package com.prisonconnect.kiosk.datasource.remote

import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.datasource.AdminDataSource
import com.prisonconnect.kiosk.models.admin.*
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.models.common.ApiResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteAdminDataSource @Inject constructor(
    private val apiService: TrustApiService
) : AdminDataSource {

    override suspend fun getPrisoners(): ApiResponse<List<Prisoner>> =
        apiService.getAdminPrisoners()

    override suspend fun getPrisoner(prisonerId: String): ApiResponse<Prisoner> =
        apiService.getAdminPrisoner(prisonerId)

    override suspend fun createPrisoner(request: CreatePrisonerRequest): ApiResponse<Prisoner> =
        apiService.createPrisoner(request)

    override suspend fun editPrisoner(prisonerId: String, request: EditPrisonerRequest): ApiResponse<Prisoner> =
        apiService.editPrisoner(prisonerId, request)

    override suspend fun updatePrisoner(prisonerId: String, prisoner: Prisoner): ApiResponse<Prisoner> =
        apiService.updatePrisoner(prisonerId, prisoner)

    override suspend fun updatePrisonerStatus(prisonerId: String, request: UpdatePrisonerStatusRequest): ApiResponse<Prisoner> =
        apiService.updatePrisonerStatus(prisonerId, request)

    override suspend fun deletePrisoner(prisonerId: String): ApiResponse<Unit> =
        apiService.deletePrisoner(prisonerId)

    override suspend fun getPrisonerContacts(prisonerId: String): ApiResponse<List<VerifiedContact>> =
        apiService.getPrisonerContacts(prisonerId)

    override suspend fun createContact(prisonerId: String, request: CreateContactRequest): ApiResponse<VerifiedContact> =
        apiService.createContact(prisonerId, request)

    override suspend fun updateContact(contactId: String, request: UpdateContactRequest): ApiResponse<VerifiedContact> =
        apiService.updateContact(contactId, request)

    override suspend fun updateContactStatus(contactId: String, request: UpdateContactStatusRequest): ApiResponse<VerifiedContact> =
        apiService.updateContactStatus(contactId, request)

    override suspend fun getPrisonerBiometrics(prisonerId: String): ApiResponse<List<BiometricRegistration>> =
        apiService.getPrisonerBiometrics(prisonerId)

    override suspend fun registerBiometric(prisonerId: String, request: RegisterBiometricRequest): ApiResponse<BiometricRegistration> =
        apiService.registerBiometric(prisonerId, request)

    override suspend fun deleteBiometric(biometricId: String): ApiResponse<Unit> =
        apiService.deleteBiometric(biometricId)

    override suspend fun getDevices(): ApiResponse<List<KioskDevice>> =
        apiService.getAdminDevices()

    override suspend fun getDevice(deviceId: String): ApiResponse<KioskDevice> =
        apiService.getAdminDevice(deviceId)

    override suspend fun getAdminProfile(): ApiResponse<AdminProfile> =
        apiService.getAdminProfile()
}
