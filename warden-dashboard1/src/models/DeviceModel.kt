package com.prisonconnect.warden.models

data class DeviceModel(
    val deviceId: String,
    val deviceName: String,
    val deviceStatus: String,
    val lastUpdated: String,
    val location: String,
    val assignedTo: String? = null
)