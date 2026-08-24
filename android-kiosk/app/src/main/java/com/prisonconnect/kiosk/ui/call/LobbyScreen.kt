package com.prisonconnect.kiosk.ui.call

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.R
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.call.CallSession
import com.prisonconnect.kiosk.models.call.RoomStatus
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

// Color Palette
private val PrimaryNavy = Color(0xFF003366)
private val LightScreenBg = Color(0xFFF4F7FA)
private val CardBorderColor = Color(0xFFE2E8F0)
private val TextDark = Color(0xFF1E293B)
private val TextGray = Color(0xFF64748B)
private val AccentGreen = Color(0xFF2E7D32)
private val AccentGreenBg = Color(0xFFE8F5E9)

@Composable
fun LobbyScreen(
    contactId: String,
    contactName: String,
    time: String,
    callType: String,
    isSlotBookedForCurrentTime: Boolean = true,
    @Suppress("UNUSED_PARAMETER") windowSizeClass: WindowSizeClass,
    onConfirm: (String) -> Unit,
    onScheduleCall: () -> Unit = {},
    onBack: () -> Unit,
    viewModel: RoomViewModel = hiltViewModel()
) {
    val createRoomState by viewModel.createRoomState.collectAsState()
    val isVideo = callType.equals("Video", ignoreCase = true)
    val isSlotAvailableNow by viewModel.isSlotAvailable.collectAsState()
    val balance by viewModel.balance.collectAsState()
    val roomStatus by viewModel.roomStatus.collectAsState()
    val remainingTime by viewModel.remainingTime.collectAsState()
    val cancelState by viewModel.cancelState.collectAsState()

    LaunchedEffect(contactId) {
        viewModel.checkSlot(contactId)
        viewModel.loadBalance()
        if (isSlotBookedForCurrentTime) {
            // Simulate start of lobby timer for scheduled call
            viewModel.startLobbyTimer(System.currentTimeMillis() + 10000) // 10 seconds countdown
        }
    }

    LaunchedEffect(createRoomState) {
        if (createRoomState is UiState.Success<*>) {
            val session = (createRoomState as UiState.Success<CallSession>).data
            // Consume BEFORE navigating: this effect re-runs on every
            // recomposition, so leaving the state as Success would re-enter
            // the call screen each time we pop back to the lobby (e.g. after
            // a failed call) — an infinite fail/restart loop.
            viewModel.consumeCreateRoomNavigation()
            onConfirm(session.sessionId)
        }
    }

    LaunchedEffect(cancelState) {
        if (cancelState is UiState.Success) {
            onBack()
        }
    }

    LobbyContent(
        contactName = contactName,
        time = time,
        isVideoCall = isVideo,
        isSlotBookedForCurrentTime = isSlotBookedForCurrentTime,
        isSlotAvailableNow = isSlotAvailableNow,
        balance = balance,
        createRoomState = createRoomState,
        roomStatus = roomStatus,
        remainingTime = remainingTime,
        cancelState = cancelState,
        onRetry = {
            viewModel.createRoom(
                contactId = contactId,
                callType = if (isVideo) "Video" else "Audio"
            )
        },
        onConfirm = {
            viewModel.createRoom(
                contactId = contactId,
                callType = if (isVideo) "Video" else "Audio"
            )
        },
        onScheduleCall = onScheduleCall,
        onCallNow = {
            viewModel.createRoom(
                contactId = contactId,
                callType = if (isVideo) "Video" else "Audio"
            )
        },
        onCancel = {
            viewModel.cancelBooking("mock-booking-id")
        },
        onBack = onBack
    )
}

@Composable
fun LobbyContent(
    contactName: String,
    time: String,
    isVideoCall: Boolean,
    isSlotBookedForCurrentTime: Boolean,
    isSlotAvailableNow: Boolean,
    balance: Double,
    createRoomState: UiState<*>,
    roomStatus: RoomStatus,
    remainingTime: Long,
    cancelState: UiState<Unit>,
    onRetry: () -> Unit,
    onConfirm: () -> Unit,
    onScheduleCall: () -> Unit,
    onCallNow: () -> Unit,
    onCancel: () -> Unit,
    onBack: () -> Unit
) {
    val callTypeTitle = if (isVideoCall) "Video Call" else "Audio Call"

    Scaffold(
        topBar = { KioskTopBar( title = if (isVideoCall) "Video Call" else "Audio Call", showBackButton = true, onBackClick = onBack) },
        containerColor = LightScreenBg
    ) { padding ->
        BoxWithConstraints(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            val isTablet = maxWidth >= 600.dp
            val horizontalPadding = if (isTablet) 36.dp else 16.dp

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = horizontalPadding, vertical = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth(if (isTablet) 0.85f else 1f)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(
                            color = PrimaryNavy.copy(alpha = 0.1f),
                            shape = CircleShape,
                            modifier = Modifier.size(if (isTablet) 48.dp else 40.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = if (isVideoCall) Icons.Default.Videocam else Icons.Default.Call,
                                    contentDescription = null,
                                    tint = PrimaryNavy,
                                    modifier = Modifier.size(if (isTablet) 26.dp else 22.dp)
                                )
                            }
                        }

                        Column {
                            Text(
                                text = "$callTypeTitle Lobby",
                                fontSize = if (isTablet) 24.sp else 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextDark
                            )
                            Text(
                                text = "Verify details before starting or scheduling your call",
                                fontSize = if (isTablet) 14.sp else 12.sp,
                                color = TextGray
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    if (isSlotBookedForCurrentTime) {
                        StatusBanner(roomStatus, remainingTime, isTablet)
                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(if (isTablet) 24.dp else 18.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "BOOKING DETAILS",
                                    fontSize = if (isTablet) 13.sp else 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TextGray,
                                    letterSpacing = 0.5.sp
                                )

                                Surface(
                                    color = PrimaryNavy.copy(alpha = 0.08f),
                                    shape = RoundedCornerShape(50)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(
                                            imageVector = if (isVideoCall) Icons.Default.Videocam else Icons.Default.Call,
                                            contentDescription = null,
                                            tint = PrimaryNavy,
                                            modifier = Modifier.size(14.dp)
                                        )
                                        Text(
                                            text = callTypeTitle,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = PrimaryNavy
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))
                            HorizontalDivider(color = CardBorderColor)
                            Spacer(modifier = Modifier.height(10.dp))

                            ValidationRow("Contact Person", contactName, isTablet)
                            ValidationRow("Date", if (isSlotBookedForCurrentTime) "28 May 2025" else "Today", isTablet)
                            ValidationRow("Time Slot", if (time.isNotEmpty() && time != "Now") time else "Current Slot (11:00 AM)", isTablet)

                            if (!isSlotBookedForCurrentTime) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("Slot Status", fontSize = if (isTablet) 14.sp else 12.sp, color = TextGray)
                                    Text(
                                        text = if (isSlotAvailableNow) "AVAILABLE" else "BUSY / TAKEN",
                                        fontSize = if (isTablet) 15.sp else 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isSlotAvailableNow) AccentGreen else Color.Red
                                    )
                                }
                            }
                            ValidationRow(
                                "Call Rate",
                                if (isVideoCall) stringResource(R.string.rate_video) else stringResource(R.string.rate_audio),
                                isTablet
                            )
                            ValidationRow("Max Duration", "5 Minutes", isTablet)

                            Spacer(modifier = Modifier.height(14.dp))
                            HorizontalDivider(color = CardBorderColor)
                            Spacer(modifier = Modifier.height(16.dp))

                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                color = LightScreenBg,
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 16.dp, vertical = 12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(
                                            text = stringResource(R.string.jail_bank_balance),
                                            fontSize = if (isTablet) 13.sp else 11.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = TextGray
                                        )
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Text(
                                            text = "₹${String.format("%.2f", balance)}",
                                            fontSize = if (isTablet) 24.sp else 20.sp,
                                            fontWeight = FontWeight.Black,
                                            color = PrimaryNavy
                                        )
                                    }

                                    Surface(
                                        color = AccentGreenBg,
                                        shape = RoundedCornerShape(50)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.CheckCircle,
                                                contentDescription = null,
                                                tint = AccentGreen,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Text(
                                                text = stringResource(R.string.sufficient_balance),
                                                fontSize = if (isTablet) 12.sp else 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = AccentGreen
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Rules Section
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Gavel,
                            contentDescription = null,
                            tint = PrimaryNavy,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            text = stringResource(R.string.call_rules),
                            fontSize = if (isTablet) 18.sp else 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextDark
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    val rules = listOf(
                        stringResource(R.string.rule_max_duration),
                        stringResource(R.string.rule_monitored),
                        stringResource(R.string.rule_prohibited),
                        stringResource(R.string.rule_billing)
                    )

                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        rules.forEach { rule ->
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                color = Color.White,
                                shape = RoundedCornerShape(12.dp),
                                border = androidx.compose.foundation.BorderStroke(1.dp, CardBorderColor)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Security,
                                        contentDescription = null,
                                        tint = PrimaryNavy,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text(
                                        text = rule,
                                        fontSize = if (isTablet) 14.sp else 12.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = TextDark
                                    )
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(32.dp))

                    // Action Buttons
                    if (!isSlotBookedForCurrentTime) {
                        CallNowActions(
                            onScheduleCall,
                            onCallNow,
                            isSlotAvailableNow,
                            isVideoCall,
                            isTablet,
                            createRoomState = createRoomState
                        )
                    } else {
                        ScheduledCallActions(
                            roomStatus = roomStatus,
                            createRoomState = createRoomState,
                            cancelState = cancelState,
                            onConfirm = onConfirm,
                            onRetry = onRetry,
                            onCancel = onCancel,
                            isTablet = isTablet
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))
                }
            }
        }
    }
}

@Composable
private fun StatusBanner(status: RoomStatus, remainingTime: Long, isTablet: Boolean) {
    val seconds = (remainingTime / 1000) % 60
    val minutes = (remainingTime / (1000 * 60)) % 60
    val timeString = String.format("%02d:%02d", minutes, seconds)

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = when(status) {
            RoomStatus.READY -> AccentGreenBg
            else -> PrimaryNavy.copy(alpha = 0.05f)
        },
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, if(status == RoomStatus.READY) AccentGreen else PrimaryNavy.copy(alpha = 0.2f))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = when(status) {
                        RoomStatus.WAITING_FOR_FAMILY -> "WAITING FOR FAMILY MEMBER"
                        RoomStatus.READY -> "READY TO JOIN"
                        RoomStatus.EXPIRED -> "SESSION EXPIRED"
                        RoomStatus.TIMEOUT -> "SESSION TIMED OUT"
                        else -> "PREPARING LOBBY"
                    },
                    fontSize = if(isTablet) 14.sp else 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = if(status == RoomStatus.READY) AccentGreen else PrimaryNavy
                )
                if (status == RoomStatus.WAITING_FOR_FAMILY) {
                    Text(
                        text = "Call starts in $timeString",
                        fontSize = if(isTablet) 20.sp else 16.sp,
                        fontWeight = FontWeight.Black,
                        color = PrimaryNavy
                    )
                }
            }
        }
    }
}

@Composable
private fun CallNowActions(
    onScheduleCall: () -> Unit,
    onCallNow: () -> Unit,
    isSlotAvailableNow: Boolean,
    isVideoCall: Boolean,
    isTablet: Boolean,
    createRoomState: UiState<*>
) {
    val isStarting = createRoomState is UiState.Loading
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        OutlinedButton(
            onClick = onScheduleCall,
            enabled = !isStarting,
            modifier = Modifier
                .weight(1f)
                .height(if (isTablet) 56.dp else 50.dp),
            shape = RoundedCornerShape(14.dp),
            border = androidx.compose.foundation.BorderStroke(1.5.dp, PrimaryNavy)
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.DateRange, contentDescription = null, tint = PrimaryNavy)
                Text(
                    text = "Schedule Call",
                    fontSize = if (isTablet) 15.sp else 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = PrimaryNavy
                )
            }
        }

        Button(
            onClick = onCallNow,
            enabled = isSlotAvailableNow && !isStarting,
            modifier = Modifier
                .weight(1f)
                .height(if (isTablet) 56.dp else 50.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = PrimaryNavy,
                disabledContainerColor = PrimaryNavy.copy(alpha = 0.5f)
            ),
            elevation = ButtonDefaults.buttonElevation(defaultElevation = 4.dp)
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (isStarting) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.5.dp,
                        modifier = Modifier.size(22.dp)
                    )
                    Text(
                        text = "Connecting...",
                        fontSize = if (isTablet) 15.sp else 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                } else {
                    Icon(
                        imageVector = if (isVideoCall) Icons.Default.Videocam else Icons.Default.PhoneInTalk,
                        contentDescription = null
                    )
                    Text(
                        text = "Call Now",
                        fontSize = if (isTablet) 15.sp else 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
private fun ScheduledCallActions(
    roomStatus: RoomStatus,
    createRoomState: UiState<*>,
    cancelState: UiState<Unit>,
    onConfirm: () -> Unit,
    onRetry: () -> Unit,
    onCancel: () -> Unit,
    isTablet: Boolean
) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (roomStatus == RoomStatus.READY) {
            Button(
                onClick = onConfirm,
                enabled = createRoomState !is UiState.Loading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(if (isTablet) 56.dp else 48.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy)
            ) {
                if (createRoomState is UiState.Loading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                } else {
                    Text(
                        text = "Join Room Now",
                        fontSize = if (isTablet) 16.sp else 14.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        } else if (roomStatus == RoomStatus.WAITING_FOR_FAMILY) {
            Button(
                onClick = {},
                enabled = false,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(if (isTablet) 56.dp else 48.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(disabledContainerColor = Color.LightGray)
            ) {
                Text("Waiting for start time...", color = Color.Gray)
            }
        }

        OutlinedButton(
            onClick = onCancel,
            enabled = cancelState !is UiState.Loading,
            modifier = Modifier
                .fillMaxWidth()
                .height(if (isTablet) 56.dp else 48.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Red),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color.Red)
        ) {
            if (cancelState is UiState.Loading) {
                CircularProgressIndicator(color = Color.Red, modifier = Modifier.size(24.dp))
            } else {
                Text("Cancel Booking", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun ValidationRow(label: String, value: String, isTablet: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = if (isTablet) 14.sp else 12.sp,
            color = TextGray
        )
        Text(
            text = value,
            fontSize = if (isTablet) 15.sp else 13.sp,
            fontWeight = FontWeight.Bold,
            color = TextDark
        )
    }
}

//@Preview(name = "Tablet View", device = "spec:width=1280dp,height=800dp,orientation=portrait", showBackground = true)
//@Composable
//fun PreviewLobbyTablet() {
//    PrisonKioskTheme {
//        LobbyContent(
//            contactName = "Suresh Kumar (Brother)",
//            time = "11:00 AM - 11:30 AM",
//            isVideoCall = true,
//            isSlotBookedForCurrentTime = true,
//            isSlotAvailableNow = true,
//            balance = 50.00,
//            createRoomState = UiState.Idle,
//            roomStatus = RoomStatus.WAITING_FOR_FAMILY,
//            remainingTime = 300000,
//            cancelState = UiState.Idle,
//            onRetry = {},
//            onConfirm = {},
//            onScheduleCall = {},
//            onCallNow = {},
//            onCancel = {},
//            onBack = {}
//        )
//    }
//}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewLobbyMobile() {
    PrisonKioskTheme {
        LobbyContent(
            contactName = "Suresh Kumar (Brother)",
            time = "11:00 AM - 11:30 AM",
            isVideoCall = true,
            isSlotBookedForCurrentTime = true,
            isSlotAvailableNow = true,
            balance = 50.00,
            createRoomState = UiState.Idle,
            roomStatus = RoomStatus.WAITING_FOR_FAMILY,
            remainingTime = 300000,
            cancelState = UiState.Idle,
            onRetry = {},
            onConfirm = {},
            onScheduleCall = {},
            onCallNow = {},
            onCancel = {},
            onBack = {}
        )
    }
}
