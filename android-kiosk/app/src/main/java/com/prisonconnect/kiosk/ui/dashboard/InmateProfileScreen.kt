package com.prisonconnect.kiosk.ui.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.ui.components.KioskErrorState
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

@Composable
fun InmateProfileScreen(
    onBack: () -> Unit,
    viewModel: InmateProfileViewModel = hiltViewModel()
) {
    val profileState by viewModel.profileState.collectAsState()

    Scaffold(
        topBar = {
            KioskTopBar( title = "Inmate Profile", showBackButton = true, onBackClick = onBack)
        },
        containerColor = Color.White
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when (val state = profileState) {
                is UiState.Loading -> KioskLoadingState()
                is UiState.Error -> KioskErrorState(message = state.message, onRetry = { viewModel.loadProfile() })
                is UiState.Success -> ProfileContent(details = state.data)
                else -> Unit
            }
        }
    }
}

@Composable
fun ProfileContent(details: InmateProfileViewModel.InmateFullDetails) {
    val profile = details.profile
    val balance = details.balance

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(
                model = profile.photoUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(120.dp)
                    .clip(CircleShape)
                    .border(3.dp, MaterialTheme.colorScheme.primary, CircleShape),
                contentScale = ContentScale.Crop,
                placeholder = rememberVectorPainter(Icons.Default.Person),
                error = rememberVectorPainter(Icons.Default.Person)
            )
            Spacer(modifier = Modifier.width(32.dp))
            Column {
                Text(
                    text = "${profile.firstName.orEmpty()} ${profile.lastName.orEmpty()}",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "ID: ${profile.inmateId.orEmpty()}",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
                StatusBadge(status = profile.status?.name.orEmpty())
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text("FACILITY DETAILS", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(16.dp))
                DetailRow("Prison", profile.facility.orEmpty())
                DetailRow("Prison ID", profile.prisonId.orEmpty())
                DetailRow("Block / Cell", profile.cellBlock.orEmpty())
                DetailRow("Security Level", profile.securityLevel ?: "N/A")
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text("SENTENCE INFORMATION", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = profile.sentenceDetails ?: "No sentence details available",
                    style = MaterialTheme.typography.bodyLarge,
                    lineHeight = 24.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text("WALLET SUMMARY", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(16.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("Balance", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("₹${balance?.credits ?: 0.0}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Remaining", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${balance?.remainingMinutes ?: 0} Mins", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(16.dp))
                DetailRow("Last Recharge", "₹${balance?.lastRechargeAmount ?: 0.0} on ${balance?.lastRechargeDate.orEmpty()}")
                DetailRow("Total Spent", "₹${balance?.totalSpent ?: 0.0}")
            }
        }
    }
}

@Composable
fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun StatusBadge(status: String) {
    val color = when (status.lowercase()) {
        "active" -> Color(0xFF2E7D32)
        "restricted" -> Color(0xFFF57C00)
        else -> Color(0xFFC62828)
    }
    Surface(
        color = color.copy(alpha = 0.1f),
        shape = RoundedCornerShape(50),
        border = BorderStroke(1.dp, color.copy(alpha = 0.5f))
    ) {
        Text(
            text = status.uppercase(),
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelMedium,
            color = color,
            fontWeight = FontWeight.Bold
        )
    }
}

// --- PREVIEWS ---

//@Preview(name = "Tablet View", device = "spec:width=1280dp,height=800dp,orientation=portrait", showBackground = true)
//@Composable
//fun PreviewInmateProfileTablet() {
//    PrisonKioskTheme {
//        Surface(color = Color.White, modifier = Modifier.fillMaxSize()) {
//            ProfileContent(
//                details = InmateProfileViewModel.InmateFullDetails(
//                    profile = InmateProfile(
//                        inmateId = "INM123456",
//                        firstName = "RAHUL",
//                        lastName = "KUMAR",
//                        cellBlock = "BLOCK A / CELL 102",
//                        facility = "Central Prison",
//                        prisonId = "P-789",
//                        status = com.prisonconnect.kiosk.models.inmate.InmateStatus.ACTIVE,
//                        securityLevel = "Medium",
//                        sentenceDetails = "Sentenced to 5 years for various offenses."
//                    ),
//                    balance = InmateBalance(
//                        credits = 100.0,
//                        remainingMinutes = 50,
//                        totalSpent = 250.0,
//                        lastRechargeAmount = 500.0,
//                        lastRechargeDate = "2025-05-20"
//                    )
//                )
//            )
//        }
//    }
//}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewInmateProfileMobile() {
    PrisonKioskTheme {
        Surface(color = Color.White, modifier = Modifier.fillMaxSize()) {
            ProfileContent(
                details = InmateProfileViewModel.InmateFullDetails(
                    profile = InmateProfile(
                        inmateId = "INM123456",
                        firstName = "RAHUL",
                        lastName = "KUMAR",
                        cellBlock = "BLOCK A / CELL 102",
                        facility = "Central Prison",
                        prisonId = "P-789",
                        status = com.prisonconnect.kiosk.models.inmate.InmateStatus.ACTIVE,
                        securityLevel = "Medium",
                        sentenceDetails = "Sentenced to 5 years for various offenses."
                    ),
                    balance = InmateBalance(
                        credits = 100.0,
                        remainingMinutes = 50,
                        totalSpent = 250.0,
                        lastRechargeAmount = 500.0,
                        lastRechargeDate = "2025-05-20"
                    )
                )
            )
        }
    }
}
