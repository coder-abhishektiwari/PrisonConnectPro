package com.prisonconnect.kiosk.models.admin

import com.google.gson.annotations.SerializedName

/**
 * Admin domain model for a prisoner.
 */
data class Prisoner(
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("prisonerNumber") val prisonerNumber: String? = null,
    @SerializedName("firstName") val firstName: String? = null,
    @SerializedName("lastName") val lastName: String? = null,
    @SerializedName("fullName") val fullName: String? = null,
    @SerializedName("dateOfBirth") val dateOfBirth: String? = null,
    @SerializedName("gender") val gender: String? = null,
    @SerializedName("prisonId") val prisonId: String? = null,
    @SerializedName("facility") val facility: String? = null,
    @SerializedName("cellBlock") val cellBlock: String? = null,
    @SerializedName("status") val status: String = "active",
    @SerializedName("active") val active: Boolean = true,
    @SerializedName("securityLevel") val securityLevel: String? = null,
    @SerializedName("sentenceDetails") val sentenceDetails: String? = null,
    @SerializedName("assignedDeviceId") val assignedDeviceId: String? = null,
    @SerializedName("assignedKioskId") val assignedKioskId: String? = null,
    @SerializedName("photoUrl") val photoUrl: String? = null,
    @SerializedName("mobileNumber") val mobileNumber: String? = null,
    @SerializedName("deviceInfo") val deviceInfo: KioskDevice? = null,
    @SerializedName("approvedContactIds") val approvedContactIds: List<String>? = null,
    @SerializedName("biometricData") val biometricData: BiometricData? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
    @SerializedName("updatedAt") val updatedAt: String? = null
) {
    val displayName: String
        get() = fullName ?: listOfNotNull(firstName, lastName).joinToString(" ").ifEmpty { "Unknown" }
}

data class BiometricData(
    @SerializedName("faceRegistered") val faceRegistered: Boolean = false,
    @SerializedName("fingerprintRegistered") val fingerprintRegistered: Boolean = false,
    @SerializedName("rfidRegistered") val rfidRegistered: Boolean = false,
    @SerializedName("lastBiometricUpdate") val lastBiometricUpdate: String? = null
)

/**
 * Admin domain model for a verified contact / family member.
 * Verification state is explicit - a contact never auto-verifies just
 * because an admin entered a phone number.
 */
data class VerifiedContact(
    @SerializedName("contactId") val contactId: String,
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("name") val name: String? = null,
    @SerializedName("fullName") val fullName: String? = null,
    @SerializedName("mobileNumber") val mobileNumber: String? = null,
    @SerializedName("phoneNumber") val phoneNumber: String? = null,
    @SerializedName("relationship") val relationship: String? = null,
    @SerializedName("active") val active: Boolean = true,
    @SerializedName("verified") val verified: Boolean = false,
    @SerializedName("approvalStatus") val approvalStatus: String? = null,
    @SerializedName("verificationStatus") val verificationStatus: String? = null,
    @SerializedName("email") val email: String? = null,
    @SerializedName("photoUrl") val photoUrl: String? = null,
    @SerializedName("lastCall") val lastCall: String? = null,
    @SerializedName("nextScheduledCall") val nextScheduledCall: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
    @SerializedName("updatedAt") val updatedAt: String? = null
) {
    val displayName: String
        get() = name ?: fullName ?: "Unknown"
    val phone: String
        get() = mobileNumber ?: phoneNumber ?: ""
}

/**
 * Admin domain model for a biometric registration.
 */
data class BiometricRegistration(
    @SerializedName("biometricId") val biometricId: String,
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("type") val type: String, // 'face' | 'fingerprint' | 'rfid'
    @SerializedName("status") val status: String, // 'registered' | 'pending' | 'failed'
    @SerializedName("registeredAt") val registeredAt: String? = null,
    @SerializedName("lastVerifiedAt") val lastVerifiedAt: String? = null,
    @SerializedName("confidence") val confidence: Double? = null,
    @SerializedName("metadata") val metadata: Map<String, String>? = null
)

/**
 * Admin domain model for a kiosk device.
 */
data class KioskDevice(
    @SerializedName("kioskId") val kioskId: String,
    @SerializedName("deviceId") val deviceId: String? = null,
    @SerializedName("deviceSerialNumber") val serialNumber: String? = null,
    @SerializedName("prisonId") val prisonId: String? = null,
    @SerializedName("status") val status: String = "offline",
    @SerializedName("authorizationStatus") val authorizationStatus: String? = null,
    @SerializedName("location") val location: String? = null,
    @SerializedName("ipAddress") val ipAddress: String? = null,
    @SerializedName("firmwareVersion") val firmwareVersion: String? = null,
    @SerializedName("appVersion") val appVersion: String? = null,
    @SerializedName("androidVersion") val androidVersion: String? = null,
    @SerializedName("model") val model: String? = null,
    @SerializedName("manufacturer") val manufacturer: String? = null,
    @SerializedName("deviceFingerprint") val deviceFingerprint: String? = null,
    @SerializedName("lastSeen") val lastSeen: String? = null,
    @SerializedName("hardware") val hardware: KioskHardware? = null,
    @SerializedName("camera") val camera: HardwareStatus? = null,
    @SerializedName("microphone") val microphone: HardwareStatus? = null,
    @SerializedName("network") val network: NetworkStatus? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
    @SerializedName("updatedAt") val updatedAt: String? = null
) {
    val isOnline: Boolean get() = status == "online"
    val displayModel: String get() = model ?: hardware?.model ?: "Unknown"
    val displayManufacturer: String get() = manufacturer ?: hardware?.manufacturer ?: "Unknown"
    val displaySerial: String get() = serialNumber ?: hardware?.serialNumber ?: "Can't be fetched"
}

data class KioskHardware(
    @SerializedName("model") val model: String? = null,
    @SerializedName("manufacturer") val manufacturer: String? = null,
    @SerializedName("serialNumber") val serialNumber: String? = null,
    @SerializedName("screenSize") val screenSize: String? = null,
    @SerializedName("processor") val processor: String? = null,
    @SerializedName("ram") val ram: String? = null,
    @SerializedName("storage") val storage: String? = null
)

data class HardwareStatus(
    @SerializedName("status") val status: String? = null,
    @SerializedName("resolution") val resolution: String? = null,
    @SerializedName("lastTested") val lastTested: String? = null
)

data class NetworkStatus(
    @SerializedName("status") val status: String? = null,
    @SerializedName("type") val type: String? = null,
    @SerializedName("signalStrength") val signalStrength: Int? = null,
    @SerializedName("bandwidth") val bandwidth: String? = null
)

/**
 * Request payloads for admin CRUD operations.
 */
data class CreatePrisonerRequest(
    @SerializedName("prisonerNumber") val prisonerNumber: String,
    @SerializedName("fullName") val fullName: String,
    @SerializedName("mobileNumber") val mobileNumber: String? = null,
    @SerializedName("dateOfBirth") val dateOfBirth: String? = null,
    @SerializedName("gender") val gender: String? = null,
    @SerializedName("prisonId") val prisonId: String? = null,
    @SerializedName("cellBlock") val cellBlock: String? = null,
    @SerializedName("cellNumber") val cellNumber: String? = null,
    @SerializedName("securityLevel") val securityLevel: String? = null,
    @SerializedName("sentenceStart") val sentenceStart: String? = null,
    @SerializedName("sentenceEnd") val sentenceEnd: String? = null,
    @SerializedName("sentenceDetails") val sentenceDetails: String? = null,
    @SerializedName("pin") val pin: String? = null,
    @SerializedName("assignedDeviceId") val assignedDeviceId: String? = null,
    @SerializedName("faceTemplate") val faceTemplate: String? = null,
    @SerializedName("fingerprintTemplate") val fingerprintTemplate: String? = null,
    @SerializedName("rfidTag") val rfidTag: String? = null
)

data class EditPrisonerRequest(
    @SerializedName("fullName") val fullName: String? = null,
    @SerializedName("mobileNumber") val mobileNumber: String? = null,
    @SerializedName("cellBlock") val cellBlock: String? = null,
    @SerializedName("securityLevel") val securityLevel: String? = null,
    @SerializedName("sentenceDetails") val sentenceDetails: String? = null,
    @SerializedName("status") val status: String? = null,
    @SerializedName("active") val active: Boolean? = null
)

data class UpdatePrisonerStatusRequest(
    @SerializedName("status") val status: String? = null,
    @SerializedName("active") val active: Boolean? = null
)

data class CreateContactRequest(
    @SerializedName("name") val name: String,
    @SerializedName("mobileNumber") val mobileNumber: String,
    @SerializedName("relationship") val relationship: String,
    @SerializedName("email") val email: String? = null,
    @SerializedName("verified") val verified: Boolean = false
)

data class UpdateContactRequest(
    @SerializedName("name") val name: String? = null,
    @SerializedName("mobileNumber") val mobileNumber: String? = null,
    @SerializedName("relationship") val relationship: String? = null,
    @SerializedName("email") val email: String? = null,
    @SerializedName("verified") val verified: Boolean? = null
)

data class UpdateContactStatusRequest(
    @SerializedName("active") val active: Boolean
)

data class RegisterBiometricRequest(
    @SerializedName("type") val type: String,
    @SerializedName("image") val image: String? = null,
    @SerializedName("capture") val capture: String? = null,
    @SerializedName("rfidToken") val rfidToken: String? = null,
    @SerializedName("status") val status: String? = "registered",
    @SerializedName("confidence") val confidence: Double? = null
)
