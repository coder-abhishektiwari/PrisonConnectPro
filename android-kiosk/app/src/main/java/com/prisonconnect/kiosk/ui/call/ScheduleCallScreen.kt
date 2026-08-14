package com.prisonconnect.kiosk.ui.call

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.schedule.AvailableSlot
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

private val PrimaryNavy = Color(0xFF003366)
private val LightBg = Color(0xFFF4F7FA)
private val TextDark = Color(0xFF1E293B)
private val TextGray = Color(0xFF64748B)
private val BorderColor = Color(0xFFE2E8F0)

@Composable
fun ScheduleCallScreen(
    contactName: String,
    initialCallType: String, // "Video" or "Audio"
    @Suppress("UNUSED_PARAMETER") windowSizeClass: WindowSizeClass,
    onSlotSelected: (selectedDate: String, selectedTime: String, selectedType: String) -> Unit,
    onBackToHome: () -> Unit,
    onBack: () -> Unit,
    viewModel: ScheduleViewModel = hiltViewModel()
) {
    val scheduleState by viewModel.scheduleState.collectAsState()
    val slotsState by viewModel.slotsState.collectAsState()

    LaunchedEffect(contactName) {
        viewModel.loadSlots(contactName)
    }

    ScheduleCallContent(
        contactName = contactName,
        initialCallType = initialCallType,
        scheduleState = scheduleState,
        slotsState = slotsState,
        onConfirmBooking = { name, slot, type ->
            viewModel.scheduleCall(name, slot, type)
        },
        onBackToHome = onBackToHome,
        onBack = onBack,
        onRetrySlots = { viewModel.loadSlots(contactName) }
    )
}

@Composable
fun ScheduleCallContent(
    contactName: String,
    initialCallType: String,
    scheduleState: UiState<Unit>,
    slotsState: UiState<List<AvailableSlot>>,
    onConfirmBooking: (String, String, String) -> Unit,
    onBackToHome: () -> Unit,
    onBack: () -> Unit,
    onRetrySlots: () -> Unit
) {
    var selectedDate by remember { mutableStateOf("") }
    var selectedTimeSlot by remember { mutableStateOf("") }
    var selectedCallType by remember { mutableStateOf(if (initialCallType.equals("Audio", true)) "Audio" else "Video") }

    var showSuccessDialog by remember { mutableStateOf(false) }

    LaunchedEffect(scheduleState) {
        if (scheduleState is UiState.Success) {
            showSuccessDialog = true
        }
    }

    LaunchedEffect(slotsState) {
        if (slotsState is UiState.Success && slotsState.data.isNotEmpty()) {
            selectedDate = slotsState.data.first().date
            selectedTimeSlot = "${slotsState.data.first().startTime} - ${slotsState.data.first().endTime}"
        }
    }

    if (showSuccessDialog) {
        FullScreenSuccessDialog(
            onGoHome = onBackToHome
        )
    }

    Scaffold(
        topBar = { KioskTopBar( title = "Schedule Call",showBackButton = true, onBackClick = onBack) },
        containerColor = LightBg
    ) { padding ->
        BoxWithConstraints(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            val isTablet = maxWidth >= 600.dp
            val hPadding = if (isTablet) 36.dp else 16.dp

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = hPadding, vertical = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Column(modifier = Modifier.fillMaxWidth(if (isTablet) 0.85f else 1f)) {

                    HeaderSection(isTablet, contactName)

                    Spacer(modifier = Modifier.height(24.dp))

                    CallTypeSection(isTablet, selectedCallType) { selectedCallType = it }

                    Spacer(modifier = Modifier.height(24.dp))

                    when (slotsState) {
                        is UiState.Loading -> {
                            Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(color = PrimaryNavy)
                            }
                        }
                        is UiState.Error -> {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(text = slotsState.message, color = Color.Red)
                                Button(onClick = onRetrySlots, modifier = Modifier.padding(top = 8.dp)) { Text("Retry") }
                            }
                        }
                        is UiState.Success -> {
                            val slots = slotsState.data
                            val dates = slots.map { it.date }.distinct()

                            Text(
                                text = "2. Select Date",
                                fontSize = if (isTablet) 16.sp else 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextDark
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                dates.forEach { date ->
                                    val isSelected = date == selectedDate
                                    Surface(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clickable { selectedDate = date },
                                        shape = RoundedCornerShape(12.dp),
                                        color = if (isSelected) PrimaryNavy else Color.White,
                                        border = if (isSelected) null else androidx.compose.foundation.BorderStroke(1.dp, BorderColor)
                                    ) {
                                        Box(
                                            modifier = Modifier.padding(vertical = 12.dp),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = date,
                                                fontSize = if (isTablet) 14.sp else 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (isSelected) Color.White else TextDark
                                            )
                                        }
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(24.dp))

                            Text(
                                text = "3. Select Available Slot",
                                fontSize = if (isTablet) 16.sp else 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextDark
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                slots.filter { it.date == selectedDate }.forEach { slot ->
                                    val slotText = "${slot.startTime} - ${slot.endTime}"
                                    val isSelected = slotText == selectedTimeSlot
                                    val isAvailable = slot.isAvailable

                                    Surface(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable(enabled = isAvailable) { selectedTimeSlot = slotText },
                                        shape = RoundedCornerShape(12.dp),
                                        color = when {
                                            isSelected -> PrimaryNavy.copy(alpha = 0.08f)
                                            !isAvailable -> Color.LightGray.copy(alpha = 0.3f)
                                            else -> Color.White
                                        },
                                        border = androidx.compose.foundation.BorderStroke(
                                            1.5.dp,
                                            if (isSelected) PrimaryNavy else BorderColor
                                        )
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.Schedule,
                                                    contentDescription = null,
                                                    tint = if (isSelected) PrimaryNavy else TextGray,
                                                    modifier = Modifier.size(18.dp)
                                                )
                                                Text(
                                                    text = slotText,
                                                    fontSize = if (isTablet) 15.sp else 13.sp,
                                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                                    color = if (isSelected) PrimaryNavy else if (isAvailable) TextDark else TextGray
                                                )
                                            }

                                            if (isSelected) {
                                                Icon(
                                                    imageVector = Icons.Default.CheckCircle,
                                                    contentDescription = null,
                                                    tint = PrimaryNavy,
                                                    modifier = Modifier.size(20.dp)
                                                )
                                            } else if (!isAvailable) {
                                                Text(
                                                    text = "Booked",
                                                    fontSize = 12.sp,
                                                    color = Color.Red,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        else -> {}
                    }

                    Spacer(modifier = Modifier.height(32.dp))

                    Button(
                        onClick = {
                            onConfirmBooking(contactName, selectedTimeSlot, selectedCallType)
                        },
                        enabled = scheduleState !is UiState.Loading && selectedTimeSlot.isNotEmpty(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(if (isTablet) 56.dp else 50.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy),
                        elevation = ButtonDefaults.buttonElevation(defaultElevation = 4.dp)
                    ) {
                        if (scheduleState is UiState.Loading) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                        } else {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Confirm Booking",
                                    fontSize = if (isTablet) 16.sp else 14.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Icon(Icons.Default.ArrowForward, contentDescription = null)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))
                }
            }
        }
    }
}

@Composable
private fun HeaderSection(isTablet: Boolean, contactName: String) {
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
                    imageVector = Icons.Default.CalendarMonth,
                    contentDescription = null,
                    tint = PrimaryNavy,
                    modifier = Modifier.size(if (isTablet) 26.dp else 22.dp)
                )
            }
        }

        Column {
            Text(
                text = "Schedule a Call",
                fontSize = if (isTablet) 24.sp else 18.sp,
                fontWeight = FontWeight.Bold,
                color = TextDark
            )
            Text(
                text = "Select date, slot and call type for $contactName",
                fontSize = if (isTablet) 14.sp else 12.sp,
                color = TextGray
            )
        }
    }
}

@Composable
private fun CallTypeSection(isTablet: Boolean, selectedCallType: String, onTypeSelected: (String) -> Unit) {
    Text(
        text = "1. Select Call Type",
        fontSize = if (isTablet) 16.sp else 14.sp,
        fontWeight = FontWeight.Bold,
        color = TextDark
    )
    Spacer(modifier = Modifier.height(10.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        TypeSelectionCard(
            title = "Video Call",
            subtitle = "₹2.00 / 1 Mins",
            icon = Icons.Default.Videocam,
            isSelected = selectedCallType == "Video",
            modifier = Modifier.weight(1f),
            onSelect = { onTypeSelected("Video") }
        )

        TypeSelectionCard(
            title = "Audio Call",
            subtitle = "₹1.00 / 1 Mins",
            icon = Icons.Default.Call,
            isSelected = selectedCallType == "Audio",
            modifier = Modifier.weight(1f),
            onSelect = { onTypeSelected("Audio") }
        )
    }
}

@Composable
fun FullScreenSuccessDialog(
    onGoHome: () -> Unit
) {
    Dialog(
        onDismissRequest = { },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = Color.White
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Surface(
                    modifier = Modifier.size(120.dp),
                    shape = CircleShape,
                    color = Color(0xFFE8F5E9)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF2E7D32),
                            modifier = Modifier.size(80.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                Text(
                    text = "Booking Successful!",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextDark
                )

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Your call has been scheduled successfully. You can find it in the 'Scheduled Calls' tab on your dashboard.",
                    fontSize = 16.sp,
                    color = TextGray,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(0.8f)
                )

                Spacer(modifier = Modifier.height(48.dp))

                Button(
                    onClick = onGoHome,
                    modifier = Modifier.fillMaxWidth(0.7f).height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy)
                ) {
                    Text("Go to Home", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun TypeSelectionCard(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    isSelected: Boolean,
    modifier: Modifier = Modifier,
    onSelect: () -> Unit
) {
    Surface(
        modifier = modifier.clickable { onSelect() },
        shape = RoundedCornerShape(14.dp),
        color = if (isSelected) PrimaryNavy.copy(alpha = 0.08f) else Color.White,
        border = androidx.compose.foundation.BorderStroke(
            1.5.dp,
            if (isSelected) PrimaryNavy else BorderColor
        )
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isSelected) PrimaryNavy else TextGray,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = title,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = if (isSelected) PrimaryNavy else TextDark
            )
            Text(
                text = subtitle,
                fontSize = 11.sp,
                color = TextGray
            )
        }
    }
}

//@Preview(name = "Tablet View", device = "spec:width=1280dp,height=800dp,orientation=portrait", showBackground = true)
//@Composable
//fun PreviewScheduleCallTablet() {
//    PrisonKioskTheme {
//        ScheduleCallContent(
//            contactName = "Suresh Kumar",
//            initialCallType = "Video",
//            scheduleState = UiState.Idle,
//            slotsState = UiState.Idle,
//            onConfirmBooking = { _, _, _ -> },
//            onBackToHome = {},
//            onBack = {},
//            onRetrySlots = {}
//        )
//    }
//}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewScheduleCallMobile() {
    PrisonKioskTheme {
        ScheduleCallContent(
            contactName = "Suresh Kumar",
            initialCallType = "Video",
            scheduleState = UiState.Idle,
            slotsState = UiState.Idle,
            onConfirmBooking = { _, _, _ -> },
            onBackToHome = {},
            onBack = {},
            onRetrySlots = {}
        )
    }
}
