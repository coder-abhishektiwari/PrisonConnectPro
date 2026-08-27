package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.models.admin.KioskDevice
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

@Composable
fun DeviceInfoScreen(
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    viewModel: DeviceInfoViewModel = hiltViewModel()
) {
    val deviceInfo by viewModel.deviceInfo.collectAsState()
    val localDeviceInfo by viewModel.localDeviceInfo.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadDeviceInfo(Constants.KIOSK_ID)
    }

    DeviceInfoContent(
        deviceInfo = deviceInfo,
        localDeviceInfo = localDeviceInfo,
        onBackClick = onBackClick
    )
}

@Composable
fun DeviceInfoContent(
    deviceInfo: KioskDevice?,
    localDeviceInfo: Map<String, String>,
    onBackClick: () -> Unit
) {
    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Device Information",
                showBackButton = true,
                onBackClick = onBackClick
            )
        },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        val items = listOf(
            DeviceInfoItem("Device Serial", deviceInfo?.serialNumber ?: "Can't fetch"),
            DeviceInfoItem("Kiosk ID", deviceInfo?.kioskId ?: "Can't fetch"),
            DeviceInfoItem("Prison ID", deviceInfo?.prisonId ?: "Can't fetch"),
            DeviceInfoItem("IP Address", deviceInfo?.ipAddress ?: "Can't fetch"),
            DeviceInfoItem("Location", deviceInfo?.location ?: "Can't fetch"),
            DeviceInfoItem("Firmware Version", deviceInfo?.firmwareVersion ?: "Can't fetch"),
            DeviceInfoItem("App Version", deviceInfo?.appVersion ?: "Can't fetch"),
            DeviceInfoItem("Last Seen", deviceInfo?.lastSeen ?: "Can't fetch")
        )

        LazyColumn(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF003366).copy(alpha = 0.1f),
                        modifier = Modifier.size(120.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.Devices,
                                contentDescription = null,
                                tint = Color(0xFF003366),
                                modifier = Modifier.size(64.dp)
                            )
                        }
                    }
                }
            }

            item {
                Text(
                    text = deviceInfo?.model ?: "Kiosk Device",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0B2240),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            item {
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (deviceInfo?.isOnline == true) Color(0xFFE8F5E9) else Color(0xFFFFEBEE)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = if (deviceInfo?.isOnline == true) Icons.Default.CheckCircle else Icons.Default.Error,
                                contentDescription = null,
                                tint = if (deviceInfo?.isOnline == true) Color(0xFF4CAF50) else Color(0xFFD32F2F),
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                text = if (deviceInfo?.isOnline == true) "Online" else "Offline",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = if (deviceInfo?.isOnline == true) Color(0xFF2E7D32) else Color(0xFFD32F2F)
                            )
                        }
                    }
                }
            }

            item {
                val localItems = localDeviceInfo.map { DeviceInfoItem(it.key, it.value) }
                InfoCard("Local Hardware Identity", localItems)
            }

            item {
                InfoCard("Device Details", items)
            }

            item {
                val hardwareItems = listOf(
                    DeviceInfoItem("Manufacturer", deviceInfo?.manufacturer ?: "Can't fetch"),
                    DeviceInfoItem("Model", deviceInfo?.model ?: "Can't fetch"),
                    DeviceInfoItem("Camera Status", deviceInfo?.camera?.status ?: "Can't fetch"),
                    DeviceInfoItem("Mic Status", deviceInfo?.microphone?.status ?: "Can't fetch"),
                    DeviceInfoItem("Network Status", deviceInfo?.network?.status ?: "Can't fetch")
                )
                InfoCard("Hardware Information", hardwareItems)
            }

            item {
                val performanceItems = listOf(
                    DeviceInfoItem("CPU", deviceInfo?.hardware?.processor ?: "Can't fetch"),
                    DeviceInfoItem("RAM", deviceInfo?.hardware?.ram ?: "Can't fetch"),
                    DeviceInfoItem("Storage", deviceInfo?.hardware?.storage ?: "Can't fetch"),
                    DeviceInfoItem("Resolution", deviceInfo?.camera?.resolution ?: "Can't fetch")
                )
                InfoCard("Storage & Performance", performanceItems)
            }

            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(2.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = null,
                                tint = Color(0xFF003366),
                                modifier = Modifier.size(24.dp)
                            )
                            Column {
                                Text(
                                    text = "PrisonConnect Kiosk",
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0B2240)
                                )
                                Text(
                                    text = "Version ${com.prisonconnect.kiosk.BuildConfig.VERSION_NAME}",
                                    fontSize = 14.sp,
                                    color = Color(0xFF687A8F)
                                )
                            }
                        }
                        Text(
                            text = "© 2025 PrisonConnect. All rights reserved.",
                            fontSize = 12.sp,
                            color = Color(0xFF687A8F),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }
    }
}

private data class DeviceInfoItem(val label: String, val value: String)

@Composable
private fun InfoCard(title: String, items: List<DeviceInfoItem>) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = title,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0B2240)
            )

            HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 1.dp)

            items.forEach { info ->
                InfoRow(label = info.label, value = info.value)
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = 14.sp,
            color = Color(0xFF687A8F)
        )
        Text(
            text = value,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF0B2240)
        )
    }
}

// --- PREVIEWS ---

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewDeviceInfoMobile() {
    PrisonKioskTheme {
        DeviceInfoContent(
            deviceInfo = KioskDevice(
                kioskId = "KIOSK-001",
                serialNumber = "SN-9876543210",
                prisonId = "PRISON-07",
                status = "online",
                location = "Main Gate Entrance",
                ipAddress = "10.0.4.152",
                firmwareVersion = "v2.4.0-stable",
                appVersion = "1.0.0",
                model = "Kiosk Elite X1",
                manufacturer = "PrisonConnect Systems",
                lastSeen = "2024-08-10 17:30:05",
                hardware = com.prisonconnect.kiosk.models.admin.KioskHardware(
                    processor = "Octa-core 2.4GHz",
                    ram = "8 GB LPDDR4X",
                    storage = "128 GB NVMe"
                ),
                camera = com.prisonconnect.kiosk.models.admin.HardwareStatus(status = "operational", resolution = "1080p"),
                microphone = com.prisonconnect.kiosk.models.admin.HardwareStatus(status = "operational"),
                network = com.prisonconnect.kiosk.models.admin.NetworkStatus(status = "connected")
            ),
            localDeviceInfo = mapOf(
                "Serial" to "SN-9876543210",
                "IP Address" to "10.0.4.152",
                "Fingerprint" to "a1b2c3d4e5f6"
            ),
            onBackClick = {}
        )
    }
}

/*
@Preview(name = "Tablet View", device = "spec:width=800dp,height=1280dp,orientation=portrait", showBackground = true)
@Composable
fun PreviewDeviceInfoTablet() {
    PrisonKioskTheme {
        DeviceInfoContent(
            deviceInfo = KioskDevice(
                kioskId = "KIOSK-001",
                serialNumber = "SN-9876543210",
                prisonId = "PRISON-07",
                status = "online",
                location = "Main Gate Entrance",
                ipAddress = "10.0.4.152",
                firmwareVersion = "v2.4.0-stable",
                appVersion = "1.0.0",
                model = "Kiosk Elite X1",
                manufacturer = "PrisonConnect Systems",
                lastSeen = "2024-08-10 17:30:05",
                hardware = com.prisonconnect.kiosk.models.admin.KioskHardware(
                    processor = "Octa-core 2.4GHz",
                    ram = "8 GB LPDDR4X",
                    storage = "128 GB NVMe"
                ),
                camera = com.prisonconnect.kiosk.models.admin.HardwareStatus(status = "operational", resolution = "1080p"),
                microphone = com.prisonconnect.kiosk.models.admin.HardwareStatus(status = "operational"),
                network = com.prisonconnect.kiosk.models.admin.NetworkStatus(status = "connected")
            ),
            localDeviceInfo = mapOf(
                "Serial" to "SN-9876543210",
                "IP Address" to "10.0.4.152",
                "Fingerprint" to "a1b2c3d4e5f6"
            ),
            onBackClick = {}
        )
    }
}
*/
