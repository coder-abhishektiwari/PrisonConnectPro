package com.prisonconnect.kiosk.datasource

import com.prisonconnect.kiosk.models.admin.*
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.models.common.ApiResponse

/**
 * Data source for admin operations (prisoners, contacts, biometrics, devices).
 */
interface AdminDataSource {
    // Prisoners
    suspend fun getPrisoners(): ApiResponse<List<Prisoner>>
    suspend fun getPrisoner(prisonerId: String): ApiResponse<Prisoner>
    suspend fun createPrisoner(request: CreatePrisonerRequest): ApiResponse<Prisoner>
    suspend fun editPrisoner(prisonerId: String, request: EditPrisonerRequest): ApiResponse<Prisoner>
    suspend fun updatePrisoner(prisonerId: String, prisoner: Prisoner): ApiResponse<Prisoner>
    suspend fun updatePrisonerStatus(prisonerId: String, request: UpdatePrisonerStatusRequest): ApiResponse<Prisoner>
    suspend fun deletePrisoner(prisonerId: String): ApiResponse<Unit>

    // Contacts
    suspend fun getPrisonerContacts(prisonerId: String): ApiResponse<List<VerifiedContact>>
    suspend fun createContact(prisonerId: String, request: CreateContactRequest): ApiResponse<VerifiedContact>
    suspend fun updateContact(contactId: String, request: UpdateContactRequest): ApiResponse<VerifiedContact>
    suspend fun updateContactStatus(contactId: String, request: UpdateContactStatusRequest): ApiResponse<VerifiedContact>

    // Biometrics
    suspend fun getPrisonerBiometrics(prisonerId: String): ApiResponse<List<BiometricRegistration>>
    suspend fun registerBiometric(prisonerId: String, request: RegisterBiometricRequest): ApiResponse<BiometricRegistration>
    suspend fun deleteBiometric(biometricId: String): ApiResponse<Unit>

    // Admin Profile
    suspend fun getAdminProfile(): ApiResponse<AdminProfile>

    // Devices
    suspend fun getDevices(): ApiResponse<List<KioskDevice>>
    suspend fun getDevice(deviceId: String): ApiResponse<KioskDevice>
}
