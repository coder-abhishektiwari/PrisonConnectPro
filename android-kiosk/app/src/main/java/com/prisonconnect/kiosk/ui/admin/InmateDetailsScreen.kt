package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.models.admin.Prisoner
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.components.KioskTopBar

/**
 * Read-only inmate profile: every field on one screen, opened by tapping an
 * inmate card on the Manage Inmates list. Editing lives behind the button.
 */
@Composable
fun InmateDetailsScreen(
    prisonerId: String,
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    onEditClick: (String) -> Unit,
    viewModel: InmateDetailsViewModel = hiltViewModel()
) {
    val prisonerResult by viewModel.prisoner.collectAsState()

    LaunchedEffect(prisonerId) {
        viewModel.loadPrisoner(prisonerId)
    }

    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Inmate Details",
                showBackButton = true,
                onBackClick = onBackClick
            )
        },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
        ) {
            when (val result = prisonerResult) {
                is NetworkResult.Loading -> {
                    KioskLoadingState(modifier = Modifier.align(Alignment.Center))
                }
                is NetworkResult.Success -> {
                    InmateDetailsContent(
                        prisoner = result.data,
                        onEditClick = { onEditClick(prisonerId) }
                    )
                }
                is NetworkResult.Failure -> {
                    Text(
                        text = result.error.message ?: "Failed to load inmate",
                        color = Color(0xFFD32F2F),
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                else -> {}
            }
        }
    }
}

private fun display(value: String?): String {
    if (value.isNullOrBlank()) return "—"
    return value
}

@Composable
private fun InfoCard(title: String, content: @Composable ColumnScope.() -> Unit) {
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
            content()
        }
    }
}

@Composable
private fun DetailItem(label: String, value: String?, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF687A8F),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = display(value),
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF0B2240)
        )
    }
}

@Composable
private fun DetailRow(labelA: String, valueA: String?, labelB: String, valueB: String?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        DetailItem(labelA, valueA, modifier = Modifier.weight(1f))
        DetailItem(labelB, valueB, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StatusChip(status: String) {
    val label = status.uppercase()
    val container = when (label) {
        "ACTIVE" -> Color(0xFFE8F5E9)
        "RESTRICTED" -> Color(0xFFFFF3E0)
        "SUSPENDED" -> Color(0xFFFFEBEE)
        else -> Color(0xFFF5F5F5)
    }
    val content = when (label) {
        "ACTIVE" -> Color(0xFF2E7D32)
        "RESTRICTED" -> Color(0xFFF57C00)
        "SUSPENDED" -> Color(0xFFD32F2F)
        else -> Color(0xFF757575)
    }
    Surface(shape = RoundedCornerShape(8.dp), color = container) {
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = content,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
        )
    }
}

@Composable
private fun InmateDetailsContent(
    prisoner: Prisoner,
    onEditClick: () -> Unit
) {
    val initial = prisoner.displayName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    val gender = prisoner.gender?.replaceFirstChar { it.uppercaseChar() }
    val rfidCardText = when {
        prisoner.biometricData?.rfidRegistered != true -> "Not registered"
        !prisoner.rfidCardNumber.isNullOrBlank() -> prisoner.rfidCardNumber
        else -> "Registered"
    }
    val fingerprintText =
        if (prisoner.biometricData?.fingerprintRegistered == true) "Registered" else "Not registered"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Profile header
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(3.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFF003366).copy(alpha = 0.1f),
                    modifier = Modifier.size(72.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = initial,
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF003366)
                        )
                    }
                }

                Text(
                    text = prisoner.displayName,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0B2240),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Text(
                    text = prisoner.prisonerNumber ?: prisoner.inmateId,
                    fontSize = 13.sp,
                    color = Color(0xFF687A8F)
                )

                StatusChip(prisoner.status)
            }
        }

        InfoCard("Personal Details") {
            DetailRow(
                "Gender", gender,
                "Age", prisoner.age?.let { "$it yrs" }
            )
            DetailRow(
                "Father/Husband Name", prisoner.fatherName,
                "Mother Name", prisoner.motherName
            )
            DetailRow(
                "Date of Admission", prisoner.dateOfAdmission,
                "Inmate Number", prisoner.prisonerNumber
            )
        }

        InfoCard("Identity") {
            DetailRow(
                "ID Proof", prisoner.idProof,
                "ID Number", prisoner.idNumber
            )
            DetailRow(
                "Religion", prisoner.religion,
                "Nationality", prisoner.nationality
            )
        }

        InfoCard("Address") {
            DetailRow(
                "State", prisoner.state,
                "District", prisoner.district
            )
            DetailItem(
                label = "Address",
                value = prisoner.address
            )
        }

        InfoCard("Status & Access") {
            DetailRow(
                "Status", prisoner.status,
                "Assigned Kiosk", prisoner.assignedKioskId
            )
            DetailRow(
                "RFID Card", rfidCardText,
                "Fingerprint", fingerprintText
            )
            DetailItem(
                label = "Registered On",
                value = prisoner.createdAt?.take(10)
            )
        }

        Button(
            onClick = onEditClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF003366))
        ) {
            Icon(Icons.Default.Edit, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Edit Inmate", fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
    }
}
