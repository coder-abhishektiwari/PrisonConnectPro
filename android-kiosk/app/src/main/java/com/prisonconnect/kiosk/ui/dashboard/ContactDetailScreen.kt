package com.prisonconnect.kiosk.ui.dashboard

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.ui.components.KioskErrorState
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

@Composable
fun ContactDetailScreen(
    contactId: String,
    onBack: () -> Unit,
    onScheduleCall: (contactId: String, name: String, type: String) -> Unit,
    onInstantCall: (contactId: String, name: String, type: String) -> Unit,
    viewModel: ContactDetailViewModel = hiltViewModel()
) {
    val contactState by viewModel.contactState.collectAsState()

    LaunchedEffect(contactId) {
        viewModel.loadContact(contactId)
    }

    Scaffold(
        topBar = {
            KioskTopBar( title = "Inmate Details", showBackButton = true, onBackClick = onBack)
        },
        containerColor = Color.White
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when (val state = contactState) {
                is UiState.Loading -> KioskLoadingState()
                is UiState.Error -> KioskErrorState(message = state.message, onRetry = { viewModel.loadContact(contactId) })
                is UiState.Success -> ContactDetailContent(
                    contact = state.data,
                    onScheduleCall = onScheduleCall,
                    onInstantCall = onInstantCall
                )
                else -> Unit
            }
        }
    }
}

@Composable
fun ContactDetailContent(
    contact: Contact,
    onScheduleCall: (contactId: String, name: String, type: String) -> Unit,
    onInstantCall: (contactId: String, name: String, type: String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        AsyncImage(
            model = contact.photoUrl,
            contentDescription = null,
            modifier = Modifier
                .size(160.dp)
                .clip(CircleShape)
                .border(4.dp, MaterialTheme.colorScheme.primary, CircleShape),
            contentScale = ContentScale.Crop,
            placeholder = rememberVectorPainter(Icons.Default.Person),
            error = rememberVectorPainter(Icons.Default.Person)
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = contact.fullName.orEmpty(),
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = contact.relationship.orEmpty(),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.primary
        )

        Spacer(modifier = Modifier.height(32.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            InfoCard(
                label = "Phone Number",
                value = contact.phoneNumber.orEmpty(),
                modifier = Modifier.weight(1f)
            )
            InfoCard(
                label = "Approval Status",
                value = if (contact.isApproved) "Approved" else "Pending",
                modifier = Modifier.weight(1f),
                valueColor = if (contact.isApproved) Color(0xFF2E7D32) else Color(0xFFF57C00)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            InfoCard(
                label = "Last Call",
                value = contact.lastCallDate ?: "Never",
                modifier = Modifier.weight(1f)
            )
            InfoCard(
                label = "Next Scheduled",
                value = contact.nextScheduledCallDate ?: "None",
                modifier = Modifier.weight(1f),
                valueColor = MaterialTheme.colorScheme.primary
            )
        }

        Spacer(modifier = Modifier.height(48.dp))

        Text(
            text = "ACTIONS",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            ActionButton(
                icon = Icons.Default.Videocam,
                label = "Video Call",
                onClick = { onInstantCall(contact.id, contact.fullName.orEmpty(), "Video") },
                modifier = Modifier.weight(1f)
            )
            ActionButton(
                icon = Icons.Default.Call,
                label = "Audio Call",
                onClick = { onInstantCall(contact.id, contact.fullName.orEmpty(), "Audio") },
                modifier = Modifier.weight(1f),
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
                contentColor = MaterialTheme.colorScheme.onSecondaryContainer
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = { onScheduleCall(contact.id, contact.fullName.orEmpty(), "Video") },
            modifier = Modifier.fillMaxWidth().height(64.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
        ) {
            Icon(Icons.Default.Schedule, contentDescription = null)
            Spacer(modifier = Modifier.width(12.dp))
            Text("Schedule Future Call", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun InfoCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.onSurface
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = valueColor)
        }
    }
}

@Composable
fun ActionButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.primaryContainer,
    contentColor: Color = MaterialTheme.colorScheme.onPrimaryContainer
) {
    Surface(
        onClick = onClick,
        modifier = modifier.height(100.dp),
        shape = RoundedCornerShape(16.dp),
        color = containerColor
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxSize()
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(32.dp))
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = label, fontWeight = FontWeight.Bold, color = contentColor)
        }
    }
}

// --- PREVIEWS ---

//@Preview(name = "Tablet View", device = "spec:width=1280dp,height=800dp,orientation=portrait", showBackground = true)
//@Composable
//fun PreviewContactDetailTablet() {
//    PrisonKioskTheme {
//        Surface(color = Color.White, modifier = Modifier.fillMaxSize()) {
//            ContactDetailContent(
//                contact = Contact(
//                    id = "1",
//                    fullName = "Suresh Kumar",
//                    relationship = "Brother",
//                    phoneNumber = "9876543210",
//                    isApproved = true,
//                    lastCallDate = "2025-05-20",
//                    nextScheduledCallDate = "2025-05-28"
//                ),
//                onScheduleCall = { _, _ -> },
//                onInstantCall = { _, _ -> }
//            )
//        }
//    }
//}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewContactDetailMobile() {
    PrisonKioskTheme {
        Surface(color = Color.White, modifier = Modifier.fillMaxSize()) {
            ContactDetailContent(
                contact = Contact(
                    id = "1",
                    fullName = "Suresh Kumar",
                    relationship = "Brother",
                    phoneNumber = "9876543210",
                    approvalStatus = "approved",
                    lastCallDate = "2025-05-20",
                    nextScheduledCallDate = "2025-05-28"
                ),
                onScheduleCall = { _, _, _ -> },
                onInstantCall = { _, _, _ -> }
            )
        }
    }
}
