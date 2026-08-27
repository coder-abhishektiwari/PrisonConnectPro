package com.prisonconnect.kiosk.datasource.remote

import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.core.ApiCache
import com.prisonconnect.kiosk.datasource.AdminDataSource
import com.prisonconnect.kiosk.models.admin.*
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.models.common.ApiResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteAdminDataSource @Inject constructor(
    private val apiService: TrustApiService,
    private val cache: ApiCache
) : AdminDataSource {

    override suspend fun getPrisoners(): ApiResponse<List<Prisoner>> =
        cache.getOrFetch("admin:prisoners") { apiService.getAdminPrisoners() }

    override suspend fun getPrisoner(prisonerId: String): ApiResponse<Prisoner> =
        cache.getOrFetch("admin:prisoner:$prisonerId") { apiService.getAdminPrisoner(prisonerId) }

    override suspend fun createPrisoner(request: CreatePrisonerRequest): ApiResponse<Prisoner> =
        apiService.createPrisoner(request).also { cache.invalidatePrefix("admin:prisoner") }

    override suspend fun editPrisoner(prisonerId: String, request: EditPrisonerRequest): ApiResponse<Prisoner> =
        apiService.editPrisoner(prisonerId, request).also { cache.invalidatePrefix("admin:prisoner") }

    override suspend fun updatePrisoner(prisonerId: String, prisoner: Prisoner): ApiResponse<Prisoner> =
        apiService.updatePrisoner(prisonerId, prisoner).also { cache.invalidatePrefix("admin:prisoner") }

    override suspend fun updatePrisonerStatus(prisonerId: String, request: UpdatePrisonerStatusRequest): ApiResponse<Prisoner> =
        apiService.updatePrisonerStatus(prisonerId, request).also { cache.invalidatePrefix("admin:prisoner") }

    override suspend fun deletePrisoner(prisonerId: String): ApiResponse<Unit> =
        apiService.deletePrisoner(prisonerId).also { cache.invalidatePrefix("admin:prisoner") }

    override suspend fun getPrisonerContacts(prisonerId: String): ApiResponse<List<VerifiedContact>> =
        cache.getOrFetch("admin:contacts:$prisonerId") { apiService.getPrisonerContacts(prisonerId) }

    override suspend fun createContact(prisonerId: String, request: CreateContactRequest): ApiResponse<VerifiedContact> =
        apiService.createContact(prisonerId, request).also { cache.invalidatePrefix("admin:contacts:$prisonerId") }

    override suspend fun updateContact(contactId: String, request: UpdateContactRequest): ApiResponse<VerifiedContact> =
        apiService.updateContact(contactId, request).also { cache.invalidatePrefix("admin:contacts") }

    override suspend fun updateContactStatus(contactId: String, request: UpdateContactStatusRequest): ApiResponse<VerifiedContact> =
        apiService.updateContactStatus(contactId, request).also { cache.invalidatePrefix("admin:contacts") }

    override suspend fun deleteContact(contactId: String): ApiResponse<Unit> =
        apiService.deleteContact(contactId).also { cache.invalidatePrefix("admin:contacts") }

    override suspend fun getPrisonerBiometrics(prisonerId: String): ApiResponse<List<BiometricRegistration>> =
        cache.getOrFetch("admin:biometrics:$prisonerId") { apiService.getPrisonerBiometrics(prisonerId) }

    override suspend fun registerBiometric(prisonerId: String, request: RegisterBiometricRequest): ApiResponse<BiometricRegistration> =
        apiService.registerBiometric(prisonerId, request).also { cache.invalidatePrefix("admin:biometrics:$prisonerId") }

    override suspend fun deleteBiometric(biometricId: String): ApiResponse<Unit> =
        apiService.deleteBiometric(biometricId).also { cache.invalidatePrefix("admin:biometrics") }

    override suspend fun getDevices(): ApiResponse<List<KioskDevice>> =
        cache.getOrFetch("admin:devices") { apiService.getAdminDevices() }

    override suspend fun getDevice(deviceId: String): ApiResponse<KioskDevice> =
        cache.getOrFetch("admin:device:$deviceId") { apiService.getAdminDevice(deviceId) }

    override suspend fun getAdminProfile(): ApiResponse<AdminProfile> =
        cache.getOrFetch("admin:profile", ttlMs = 60_000L) { apiService.getAdminProfile() }
}
