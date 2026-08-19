package com.prisonconnect.kiosk.ui.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Wallet
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.call.CallType
import com.prisonconnect.kiosk.models.call.CallHistory
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.models.inmate.InmateBalance
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.models.call.ScheduledCall
import com.prisonconnect.kiosk.ui.components.KioskErrorState
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

// --- Color Palette ---
private val HeaderBlue = Color(0xFF003366)
private val TextDarkBlue = Color(0xFF0B2240)
private val TextGray = Color(0xFF687A8F)
private val GreenActiveBg = Color(0xFFE8F5E9)
private val GreenActiveText = Color(0xFF2E7D32)
private val GreenAccentBorder = Color(0xFF1B5E20)
private val ActionButtonBg = Color(0xFFF0F4F8)
private val HomeNavGreen = Color(0xFFA8F5A2)

@Composable
fun DashboardScreen(
    windowSizeClass: WindowSizeClass,
    onContactClick: (contactId: String, name: String, type: String) -> Unit,
    onContactDetailClick: (String) -> Unit,
    onScheduledCallClick: (ScheduledCall) -> Unit,
    onViewAllContacts: () -> Unit,
    onViewHistory: () -> Unit,
    onProfileClick: () -> Unit,
    onWalletClick: () -> Unit,
    onLogoutClick: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val dashboardState by viewModel.dashboardState.collectAsState()
    val jailBalance by viewModel.jailBalance.collectAsState()
    var currentTab by remember { mutableIntStateOf(0) }

    var currentTime by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            currentTime = System.currentTimeMillis()
            delay(1000)
        }
    }

    Scaffold(
        topBar = {
            KioskTopHeader(
                balance = jailBalance,
                currentTime = currentTime,
                onRefresh = { viewModel.refreshAll() },
                onLogoutClick = {
                    viewModel.logout()
                    onLogoutClick()
                }
            )
        },
        bottomBar = {
            KioskBottomBar(
                selectedTab = currentTab,
                onTabSelected = { currentTab = it }
            )
        },
        containerColor = Color.White
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues).fillMaxSize()) {
            when (val state = dashboardState) {
                is UiState.Loading -> KioskLoadingState()
                is UiState.Error -> KioskErrorState(message = state.message, onRetry = { viewModel.loadDashboardData() })
                is UiState.Success -> {
                    when (currentTab) {
                        0 -> DashboardContent(
                            windowWidthSizeClass = windowSizeClass.widthSizeClass,
                            data = state.data,
                            onContactClick = onContactClick,
                            onContactDetailClick = onContactDetailClick,
                            onScheduledCallClick = onScheduledCallClick,
                            onProfileClick = onProfileClick,
                            onWalletClick = onWalletClick,
                            onViewAllContacts = onViewAllContacts
                        )
                        1 -> ScheduleTabContent(
                            scheduledCalls = state.data.scheduledCalls,
                            onCallClick = onScheduledCallClick
                        )
                        2 -> HistoryTabContent(
                            callHistory = state.data.callHistory,
                            onRefresh = { viewModel.refreshAll() }
                        )
                    }
                }
                else -> Unit
            }
        }
    }
}

@Composable
fun ScheduleTabContent(
    scheduledCalls: List<ScheduledCall>,
    onCallClick: (ScheduledCall) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "MY SCHEDULED CALLS",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = TextDarkBlue,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        if (scheduledCalls.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No scheduled calls found", color = TextGray)
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(scheduledCalls) { call ->
                    ScheduledCallCard(call = call, onClick = { onCallClick(call) })
                }
            }
        }
    }
}

@Composable
fun HistoryTabContent(
    callHistory: List<CallHistory>,
    onRefresh: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "CALL HISTORY",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = TextDarkBlue
            )
            TextButton(onClick = onRefresh) {
                Icon(Icons.Default.Refresh, contentDescription = null, tint = HeaderBlue, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Refresh", color = HeaderBlue)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (callHistory.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No call history yet", color = TextGray)
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(callHistory) { call ->
                    CallHistoryCard(call = call)
                }
            }
        }
    }
}

@Composable
fun CallHistoryCard(call: CallHistory) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                color = HeaderBlue.copy(alpha = 0.1f),
                shape = CircleShape,
                modifier = Modifier.size(48.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = if (call.type == CallType.VIDEO) Icons.Default.Videocam else Icons.Default.Call,
                        contentDescription = null,
                        tint = HeaderBlue
                    )
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = call.contactName.orEmpty(),
                    fontWeight = FontWeight.Bold,
                    color = TextDarkBlue
                )
                Text(
                    text = formatCallDate(call.startTime) + " • " + formatCallDuration(call),
                    fontSize = 12.sp,
                    color = TextGray
                )
            }

            Surface(
                color = when (call.status) {
                    "completed" -> GreenActiveBg
                    "failed" -> Color(0xFFFFEBEE)
                    "cancelled", "rejected", "missed" -> Color(0xFFFFF3E0)
                    else -> Color(0xFFF0F4F8)
                },
                shape = RoundedCornerShape(50)
            ) {
                Text(
                    text = call.status.orEmpty().uppercase(),
                    color = when (call.status) {
                        "completed" -> GreenActiveText
                        "failed" -> Color(0xFFC62828)
                        "cancelled", "rejected", "missed" -> Color(0xFFE65100)
                        else -> TextGray
                    },
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                )
            }
        }
    }
}

private fun formatCallDate(startTime: String?): String {
    if (startTime.isNullOrBlank()) return "—"
    return try {
        val parsed = try {
            java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssX", Locale.getDefault()).parse(startTime)
                ?: java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.getDefault()).parse(startTime)
        } catch (e: Exception) {
            java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.getDefault()).parse(startTime)
        }
        if (parsed != null) {
            java.text.SimpleDateFormat("d MMM yyyy • h:mm a", Locale.getDefault()).format(parsed)
        } else "—"
    } catch (e: Exception) {
        startTime
    }
}

private fun formatCallDuration(call: CallHistory): String {
    val mins = if (call.duration != null && call.duration > 0) call.duration.div(60) else call.durationMinutes
    return if (mins != null && mins > 0) "${mins} min" else ""
}

@Composable
fun ScheduledCallCard(call: ScheduledCall, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                color = HeaderBlue.copy(alpha = 0.1f),
                shape = CircleShape,
                modifier = Modifier.size(48.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = if (call.type == CallType.VIDEO) Icons.Default.Videocam else Icons.Default.Call,
                        contentDescription = null,
                        tint = HeaderBlue
                    )
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(text = call.contactName.orEmpty(), fontWeight = FontWeight.Bold, color = TextDarkBlue)
                Text(text = "${call.date.orEmpty()} • ${call.timeSlot.orEmpty()}", fontSize = 12.sp, color = TextGray)
            }

            Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = TextGray)
        }
    }
}

@Composable
fun DashboardContent(
    windowWidthSizeClass: WindowWidthSizeClass,
    data: DashboardViewModel.DashboardData,
    onContactClick: (contactId: String, name: String, type: String) -> Unit,
    onContactDetailClick: (String) -> Unit,
    onScheduledCallClick: (ScheduledCall) -> Unit,
    onProfileClick: () -> Unit,
    onWalletClick: () -> Unit,
    onViewAllContacts: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 16.dp, bottom = 24.dp)
    ) {
        // 1. Profile Card
        item {
            InmateProfileCard(
                inmateProfile = data.profile,
                onClick = onProfileClick
            )
        }

        // 2. Wallet Card (tap to open wallet screen)
        item {
            WalletDetailCard(
                balance = data.balance,
                onClick = onWalletClick
            )
        }

        // 3. Section Header
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "APPROVED CONTACTS",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = TextDarkBlue,
                    letterSpacing = 0.8.sp
                )
                TextButton(onClick = onViewAllContacts) {
                    Text("View All", color = HeaderBlue)
                }
            }
        }

        // 4. Contacts List
        if (data.contacts.isEmpty()) {
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White
                ) {
                    Text(
                        text = "No approved contacts found",
                        modifier = Modifier.padding(24.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        color = TextGray
                    )
                }
            }
        } else {
            items(data.contacts) { contact ->
                ContactCardItem(
                    contact = contact,
                    onClick = { onContactDetailClick(contact.id) },
                    onCallClick = { onContactClick(contact.id, contact.fullName, "Audio") },
                    onVideoClick = { onContactClick(contact.id, contact.fullName, "Video") }
                )
            }
        }
    }
}

@Composable
fun WalletDetailCard(balance: InmateBalance?, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.padding(24.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("BALANCE", style = MaterialTheme.typography.labelSmall, color = TextGray)
                Text("₹${String.format("%.2f", balance?.credits ?: 0.0)}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = HeaderBlue)
            }
            VerticalDivider(modifier = Modifier.height(40.dp).padding(horizontal = 24.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("TOTAL SPENT", style = MaterialTheme.typography.labelSmall, color = TextGray)
                Text("₹${String.format("%.2f", balance?.totalSpent ?: 0.0)}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            }
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Open wallet", tint = HeaderBlue)
        }
    }
}

@Composable
private fun InmateProfileCard(
    inmateProfile: InmateProfile,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Avatar
            AsyncImage(
                model = inmateProfile.photoUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xFFF1F5F9)),
                contentScale = ContentScale.Crop,
                placeholder = rememberVectorPainter(Icons.Default.Person),
                error = rememberVectorPainter(Icons.Default.Person)
            )

            Spacer(modifier = Modifier.width(12.dp))

            // Info
            Column(modifier = Modifier.weight(1f)) {
                // Name + Status
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "${inmateProfile.firstName.orEmpty()} ${inmateProfile.lastName.orEmpty()}",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextDarkBlue,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )

                    Surface(
                        color = GreenActiveBg,
                        shape = RoundedCornerShape(50)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.CheckCircle,
                                contentDescription = null,
                                tint = GreenActiveText,
                                modifier = Modifier.size(11.dp)
                            )
                            Text(
                                text = inmateProfile.status.name.uppercase(),
                                color = GreenActiveText,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // ID + Cell in one line
                Text(
                    text = "${inmateProfile.inmateId.orEmpty()}  •  ${inmateProfile.cellBlock.orEmpty()}",
                    fontSize = 12.sp,
                    color = TextGray,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}


@Composable
private fun ContactCardItem(
    contact: Contact,
    onClick: () -> Unit,
    onCallClick: () -> Unit,
    onVideoClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = Color.White,
        shadowElevation = 1.dp
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .width(5.dp)
                    .height(84.dp)
                    .background(GreenAccentBorder, shape = RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp))
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    AsyncImage(
                        model = contact.photoUrl,
                        contentDescription = null,
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .border(1.dp, Color(0xFFE2E8F0), CircleShape)
                            .background(Color.White),
                        contentScale = ContentScale.Crop,
                        placeholder = rememberVectorPainter(Icons.Default.Person),
                        error = rememberVectorPainter(Icons.Default.Person)
                    )

                    Column {
                        Text(
                            text = contact.fullName.orEmpty(),
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = TextDarkBlue,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = "(${contact.relationship.orEmpty()})",
                            fontSize = 12.sp,
                            color = TextGray
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                            modifier = Modifier.padding(top = 2.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.CheckCircle,
                                contentDescription = null,
                                tint = GreenActiveText,
                                modifier = Modifier.size(11.dp)
                            )
                            Text(
                                text = "VERIFIED",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = GreenActiveText,
                                letterSpacing = 0.5.sp
                            )
                        }
                    }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onCallClick, colors = IconButtonDefaults.iconButtonColors(containerColor = ActionButtonBg)) {
                        Icon(Icons.Default.Call, contentDescription = null, tint = HeaderBlue)
                    }
                    IconButton(onClick = onVideoClick, colors = IconButtonDefaults.iconButtonColors(containerColor = ActionButtonBg)) {
                        Icon(Icons.Default.Videocam, contentDescription = null, tint = HeaderBlue)
                    }
                }
            }
        }
    }
}

@Composable
private fun KioskTopHeader(
    balance: Double,
    currentTime: Long,
    onRefresh: () -> Unit,
    onLogoutClick: () -> Unit
) {
    val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())
    val dateFormat = SimpleDateFormat("h:mm a  •  d MMM yyyy", Locale.getDefault())

    Surface(color = HeaderBlue, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = timeFormat.format(Date(currentTime)).uppercase(),
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = dateFormat.format(Date(currentTime)).uppercase(),
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
                }
                Surface(
                    color = Color.White.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.25f))
                ) {
                    Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Outlined.Wallet, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Text(text = "₹${String.format("%.2f", balance)}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }
                IconButton(onClick = onLogoutClick) {
                    Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun KioskBottomBar(selectedTab: Int, onTabSelected: (Int) -> Unit) {
    Surface(
        color = Color.White,
        shadowElevation = 8.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp, horizontal = 24.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically
        ) {
            BottomNavItem(
                selected = selectedTab == 0,
                onClick = { onTabSelected(0) },
                icon = Icons.Default.Home,
                label = "Home"
            )
            BottomNavItem(
                selected = selectedTab == 1,
                onClick = { onTabSelected(1) },
                icon = Icons.Default.Schedule,
                label = "Schedule"
            )
            BottomNavItem(
                selected = selectedTab == 2,
                onClick = { onTabSelected(2) },
                icon = Icons.Default.Refresh,
                label = "History"
            )
        }
    }
}

@Composable
private fun BottomNavItem(
    selected: Boolean,
    onClick: () -> Unit,
    icon: ImageVector,
    label: String
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.clickable(
            interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
            indication = null,
            onClick = onClick
        )
    ) {
        Surface(
            color = if (selected) HomeNavGreen else Color.Transparent,
            shape = RoundedCornerShape(20.dp)
        ) {
            Box(
                modifier = Modifier
                    .width(80.dp)
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = if (selected) TextDarkBlue else TextGray,
                    modifier = Modifier.size(22.dp)
                )
            }
        }
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = if (selected) TextDarkBlue else TextGray
        )
    }
}

// --- PREVIEWS ---

//@Preview(name = "Tablet View", device = "spec:width=1280dp,height=800dp,orientation=portrait", showBackground = true)
//@Composable
//fun PreviewDashboardTablet() {
//    PrisonKioskTheme {
//        Surface(color = Color.White, modifier = Modifier.fillMaxSize()) {
//            DashboardContent(
//                windowWidthSizeClass = WindowWidthSizeClass.Expanded,
//                data = DashboardViewModel.DashboardData(
//                    profile = InmateProfile(
//                        inmateId = "INM123456",
//                        firstName = "RAHUL",
//                        lastName = "KUMAR",
//                        cellBlock = "BLOCK A / CELL 102",
//                        facility = "Central Prison",
//                        prisonId = "P-789",
//                        status = com.prisonconnect.kiosk.models.inmate.InmateStatus.ACTIVE
//                    ),
//                    balance = InmateBalance(
//                        credits = 100.0,
//                        remainingMinutes = 50,
//                        totalSpent = 250.0,
//                        lastRechargeAmount = 500.0,
//                        lastRechargeDate = "2025-05-20"
//                    ),
//                    contacts = listOf(
//                        Contact(
//                            id = "1",
//                            fullName = "Suresh Kumar",
//                            relationship = "Brother",
//                            phoneNumber = "9876543210",
//                            isApproved = true
//                        ),
//                        Contact(
//                            id = "2",
//                            fullName = "Mohan Sharma",
//                            relationship = "Brother",
//                            phoneNumber = "9876787678",
//                            isApproved = true
//                        ),
//                        Contact(
//                            id = "3",
//                            fullName = "Rohit Verma",
//                            relationship = "Father",
//                            phoneNumber = "9999675678",
//                            isApproved = true
//                        ),
//
//                        ),
//                    scheduledCalls = emptyList()
//                ),
//                onContactClick = { _, _ -> },
//                onContactDetailClick = {},
//                onScheduledCallClick = {},
//                onProfileClick = {},
//                onViewAllContacts = {}
//            )
//        }
//    }
//}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewDashboardMobile() {
    PrisonKioskTheme {
        Surface(color = Color.White, modifier = Modifier.fillMaxSize()) {
            DashboardContent(
                windowWidthSizeClass = WindowWidthSizeClass.Compact,
                data = DashboardViewModel.DashboardData(
                    profile = InmateProfile(
                        inmateId = "INM123456",
                        firstName = "RAHUL",
                        lastName = "KUMAR",
                        cellBlock = "BLOCK A / CELL 102",
                        facility = "Central Prison",
                        prisonId = "P-789",
                        status = com.prisonconnect.kiosk.models.inmate.InmateStatus.ACTIVE
                    ),
                    balance = InmateBalance(
                        credits = 0.0,
                        remainingMinutes = 0,
                        totalSpent = 0.0,
                        lastRechargeAmount = 0.0,
                        lastRechargeDate = null
                    ),
                    contacts = listOf(
                        Contact(
                            id = "1",
                            fullName = "Suresh Kumar",
                            relationship = "Brother",
                            phoneNumber = "9876543210",
                            approvalStatus = "approved"
                        ),
                        Contact(
                            id = "2",
                            fullName = "Mohan Sharma",
                            relationship = "Brother",
                            phoneNumber = "9876787678",
                            approvalStatus = "approved"
                        ),
                        Contact(
                            id = "3",
                            fullName = "Rohit Verma",
                            relationship = "Father",
                            phoneNumber = "9999675678",
                            approvalStatus = "approved"
                        ),

                        ),
                    scheduledCalls = emptyList(),
                    callHistory = emptyList()
                ),
                onContactClick = { _, _, _ -> },
                onContactDetailClick = {},
                onScheduledCallClick = {},
                onProfileClick = {},
                onWalletClick = {},
                onViewAllContacts = {}
            )
        }
    }
}
