package com.prisonconnect.kiosk.repository

import com.prisonconnect.kiosk.models.admin.*
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.network.NetworkResult
import kotlinx.coroutines.flow.Flow

/**
 * Repository for admin operations (prisoners, contacts, biometrics, devices).
 */
interface AdminRepository {
    // Prisoners
    fun getPrisoners(): Flow<NetworkResult<List<Prisoner>>>
    fun getPrisoner(prisonerId: String): Flow<NetworkResult<Prisoner>>
    fun createPrisoner(request: CreatePrisonerRequest): Flow<NetworkResult<Prisoner>>
    fun editPrisoner(prisonerId: String, request: EditPrisonerRequest): Flow<NetworkResult<Prisoner>>
    fun updatePrisonerStatus(prisonerId: String, request: UpdatePrisonerStatusRequest): Flow<NetworkResult<Prisoner>>
    fun deletePrisoner(prisonerId: String): Flow<NetworkResult<Unit>>

    // Contacts
    fun getPrisonerContacts(prisonerId: String): Flow<NetworkResult<List<VerifiedContact>>>
    fun createContact(prisonerId: String, request: CreateContactRequest): Flow<NetworkResult<VerifiedContact>>
    fun updateContact(contactId: String, request: UpdateContactRequest): Flow<NetworkResult<VerifiedContact>>
    fun updateContactStatus(contactId: String, request: UpdateContactStatusRequest): Flow<NetworkResult<VerifiedContact>>

    // Biometrics
    fun getPrisonerBiometrics(prisonerId: String): Flow<NetworkResult<List<BiometricRegistration>>>
    suspend fun registerBiometric(prisonerId: String, request: RegisterBiometricRequest): NetworkResult<BiometricRegistration>
    fun deleteBiometric(biometricId: String): Flow<NetworkResult<Unit>>

    // Admin Profile
    fun getAdminProfile(): Flow<NetworkResult<AdminProfile>>

    // Devices
    fun getDevices(): Flow<NetworkResult<List<KioskDevice>>>
    fun getDevice(deviceId: String): Flow<NetworkResult<KioskDevice>>
}
