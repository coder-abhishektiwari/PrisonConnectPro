package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
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
import com.prisonconnect.kiosk.models.auth.AdminProfile
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

@Composable
fun AdminDashboardScreen(
    windowSizeClass: WindowSizeClass,
    onAddPrisonerClick: () -> Unit,
    onManagePrisonersClick: () -> Unit,
    onDeviceInfoClick: () -> Unit,
    onLogoutClick: () -> Unit,
    viewModel: AdminDashboardViewModel = hiltViewModel()
) {
    val adminProfile by viewModel.adminProfile.collectAsState()

    AdminDashboardContent(
        adminProfile = adminProfile,
        onAddPrisonerClick = onAddPrisonerClick,
        onManagePrisonersClick = onManagePrisonersClick,
        onDeviceInfoClick = onDeviceInfoClick,
        onLogoutClick = onLogoutClick
    )
}

@Composable
fun AdminDashboardContent(
    adminProfile: AdminProfile?,
    onAddPrisonerClick: () -> Unit,
    onManagePrisonersClick: () -> Unit,
    onDeviceInfoClick: () -> Unit,
    onLogoutClick: () -> Unit
) {
    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Admin Dashboard",
                showBackButton = false,
                onBackClick = onLogoutClick
            )
        },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Admin Info Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(2.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(20.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF003366),
                            modifier = Modifier.size(60.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.AdminPanelSettings,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(32.dp)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.width(16.dp))

                        Column {
                            Text(
                                text = adminProfile?.name ?: "Admin User",
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0B2240)
                            )
                            Text(
                                text = adminProfile?.email ?: "",
                                fontSize = 14.sp,
                                color = Color(0xFF687A8F)
                            )
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0xFFE3F2FD),
                                modifier = Modifier.padding(top = 8.dp)
                            ) {
                                Text(
                                    text = adminProfile?.role?.uppercase() ?: "ADMIN",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF003366),
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                }
            }

            // Quick Actions
            item {
                Text(
                    text = "QUICK ACTIONS",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0B2240),
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }

            // Add Prisoner Card
            item {
                AdminActionCard(
                    title = "Add New Prisoner",
                    description = "Register a new prisoner with biometric data",
                    icon = Icons.Default.PersonAdd,
                    iconColor = Color(0xFF4CAF50),
                    onClick = onAddPrisonerClick
                )
            }

            // Manage Prisoners Card
            item {
                AdminActionCard(
                    title = "Manage Prisoners",
                    description = "View, edit or delete existing prisoners",
                    icon = Icons.Default.List,
                    iconColor = Color(0xFF2196F3),
                    onClick = onManagePrisonersClick
                )
            }

            // Device Info Card
            item {
                AdminActionCard(
                    title = "Device Information",
                    description = "View kiosk and device details",
                    icon = Icons.Default.Info,
                    iconColor = Color(0xFFFF9800),
                    onClick = onDeviceInfoClick
                )
            }

            // Logout Button
            item {
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(
                    onClick = onLogoutClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFD32F2F))
                ) {
                    Icon(Icons.Default.ExitToApp, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Logout", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun AdminActionCard(
    title: String,
    description: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconColor: Color,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Row(
            modifier = Modifier.padding(20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = CircleShape,
                color = iconColor.copy(alpha = 0.1f),
                modifier = Modifier.size(56.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = iconColor,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0B2240)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = description,
                    fontSize = 14.sp,
                    color = Color(0xFF687A8F)
                )
            }

            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = Color(0xFF687A8F)
            )
        }
    }
}

// --- PREVIEWS ---

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewAdminDashboardMobile() {
    PrisonKioskTheme {
        AdminDashboardContent(
            adminProfile = AdminProfile(
                adminId = "ADMIN-001",
                employeeId = "EMP12345",
                name = "Officer Vikram Singh",
                email = "vikram.singh@prison.gov.in",
                role = "Senior Warden",
                permissions = emptyList(),
                status = "active"
            ),
            onAddPrisonerClick = {},
            onManagePrisonersClick = {},
            onDeviceInfoClick = {},
            onLogoutClick = {}
        )
    }
}

/*
@Preview(name = "Tablet View", device = "spec:width=800dp,height=1280dp,orientation=portrait", showBackground = true)
@Composable
fun PreviewAdminDashboardTablet() {
    PrisonKioskTheme {
        AdminDashboardContent(
            adminProfile = AdminProfile(
                adminId = "ADMIN-001",
                employeeId = "EMP12345",
                name = "Officer Vikram Singh",
                email = "vikram.singh@prison.gov.in",
                role = "Senior Warden",
                permissions = emptyList(),
                status = "active"
            ),
            onAddPrisonerClick = {},
            onManagePrisonersClick = {},
            onDeviceInfoClick = {},
            onLogoutClick = {}
        )
    }
}
*/
