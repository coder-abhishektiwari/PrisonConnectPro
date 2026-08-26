package com.prisonconnect.kiosk.ui.call

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.schedule.BookedSlot
import com.prisonconnect.kiosk.models.schedule.SlotsResponse
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.components.WheelTimePicker
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val PrimaryNavy = Color(0xFF003366)
private val LightBg = Color(0xFFF4F7FA)
private val TextDark = Color(0xFF1E293B)
private val TextGray = Color(0xFF64748B)
private val BorderColor = Color(0xFFE2E8F0)
private val DangerRed = Color(0xFFDC2626)
private val DangerBg = Color(0xFFFFF1F2)

@Composable
fun ScheduleCallScreen(
    contactId: String,
    contactName: String,
    initialCallType: String,
    @Suppress("UNUSED_PARAMETER") windowSizeClass: WindowSizeClass,
    onSlotSelected: (selectedDate: String, selectedTime: String, selectedType: String) -> Unit,
    onBackToHome: () -> Unit,
    onBack: () -> Unit,
    viewModel: ScheduleViewModel = hiltViewModel()
) {
    val scheduleState by viewModel.scheduleState.collectAsState()
    val slotsState by viewModel.slotsState.collectAsState()

    // Load slots for today on first render
    LaunchedEffect(Unit) {
        val today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        viewModel.loadBookedSlots(today)
    }

    ScheduleCallContent(
        contactId = contactId,
        contactName = contactName,
        initialCallType = initialCallType,
        scheduleState = scheduleState,
        slotsState = slotsState,
        onDateSelected = { date -> viewModel.loadBookedSlots(date) },
        onConfirmBooking = { date, time, type ->
            viewModel.scheduleCall(contactId, date, time, type)
        },
        onBackToHome = onBackToHome,
        onBack = onBack
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleCallContent(
    contactId: String,
    contactName: String,
    initialCallType: String,
    scheduleState: UiState<Unit>,
    slotsState: UiState<SlotsResponse>,
    onDateSelected: (String) -> Unit,
    onConfirmBooking: (String, String, String) -> Unit,
    onBackToHome: () -> Unit,
    onBack: () -> Unit
) {
    val today = remember { LocalDate.now() }
    val formatter = remember { DateTimeFormatter.ofPattern("yyyy-MM-dd") }
    val displayFormatter = remember { DateTimeFormatter.ofPattern("EEE, MMM d") }

    // Date options: Today, Tomorrow, +2 more days, + More (calendar)
    val dateOptions = remember(today) {
        (0..3).map { today.plusDays(it.toLong()) }
    }

    var selectedDateIndex by remember { mutableIntStateOf(0) }
    var selectedDate by remember { mutableStateOf(today.format(formatter)) }
    var selectedCallType by remember { mutableStateOf(if (initialCallType.equals("Audio", true)) "Audio" else "Video") }
    var selectedHour by remember { mutableIntStateOf(9) }
    var selectedMinute by remember { mutableIntStateOf(0) }
    var selectedIsPm by remember { mutableStateOf(false) }
    var showCalendar by remember { mutableStateOf(false) }
    var showSuccessDialog by remember { mutableStateOf(false) }
    var showConflictDialog by remember { mutableStateOf(false) }
    var conflictMessage by remember { mutableStateOf("") }
    var calendarSelectedDate by remember { mutableStateOf(today) }

    val bookedSlots = remember(slotsState) {
        when (slotsState) {
            is UiState.Success -> slotsState.data.bookedSlots
            else -> emptyList()
        }
    }

    // Check if selected time conflicts with booked slots (10-min buffer)
    val hasConflict = remember(selectedHour, selectedMinute, selectedIsPm, bookedSlots) {
        val toMin = selectedHour * 60 + selectedMinute
        bookedSlots.any { slot ->
            val parts = slot.timeSlot.split("-")
            if (parts.size == 2) {
                val bStart = parseTimeToMinutes(parts[0].trim())
                val bEnd = parseTimeToMinutes(parts[1].trim())
                toMin in (bStart - 9)..(bEnd + 9)
            } else false
        }
    }

    LaunchedEffect(scheduleState) {
        if (scheduleState is UiState.Success) {
            showSuccessDialog = true
        }
    }

    if (showSuccessDialog) {
        FullScreenSuccessDialog(onGoHome = onBackToHome)
    }

    if (showConflictDialog) {
        AlertDialog(
            onDismissRequest = { showConflictDialog = false },
            icon = { Icon(Icons.Default.Warning, contentDescription = null, tint = DangerRed) },
            title = { Text("Time Conflict", fontWeight = FontWeight.Bold) },
            text = { Text(conflictMessage) },
            confirmButton = {
                TextButton(onClick = { showConflictDialog = false }) {
                    Text("OK", color = PrimaryNavy, fontWeight = FontWeight.Bold)
                }
            },
            containerColor = Color.White
        )
    }

    // Calendar dialog
    if (showCalendar) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = calendarSelectedDate.toEpochDay() * 86400000L
        )
        DatePickerDialog(
            onDismissRequest = { showCalendar = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        val picked = LocalDate.ofEpochDay(millis / 86400000L)
                        if (!picked.isBefore(today)) {
                            calendarSelectedDate = picked
                            selectedDate = picked.format(formatter)
                            onDateSelected(selectedDate)
                            showCalendar = false
                        }
                    }
                }) { Text("OK", color = PrimaryNavy) }
            },
            dismissButton = {
                TextButton(onClick = { showCalendar = false }) { Text("Cancel") }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }

    Scaffold(
        topBar = { KioskTopBar(title = "Schedule Call", showBackButton = true, onBackClick = onBack) },
        containerColor = LightBg
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            // Header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(bottom = 12.dp)
            ) {
                Surface(
                    color = PrimaryNavy.copy(alpha = 0.1f),
                    shape = CircleShape,
                    modifier = Modifier.size(40.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = PrimaryNavy, modifier = Modifier.size(22.dp))
                    }
                }
                Column {
                    Text("Schedule for $contactName", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextDark)
                    Text(
                        if (selectedCallType == "Video") "Video Call" else "Audio Call",
                        fontSize = 12.sp, color = TextGray
                    )
                }
            }

            // Scrollable content
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
            ) {
                // === DATE SELECTOR ===
                Text("Select Date", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextDark)
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    dateOptions.forEachIndexed { index, date ->
                        val isSelected = selectedDate == date.format(formatter)
                        val label = when (index) {
                            0 -> "Today"
                            1 -> "Tomorrow"
                            else -> date.format(displayFormatter)
                        }
                        Surface(
                            modifier = Modifier
                                .weight(1f)
                                .clickable {
                                    selectedDateIndex = index
                                    selectedDate = date.format(formatter)
                                    onDateSelected(selectedDate)
                                },
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) PrimaryNavy else Color.White,
                            border = if (isSelected) null else BorderStroke(1.dp, BorderColor)
                        ) {
                            Box(
                                modifier = Modifier.padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isSelected) Color.White else TextDark,
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                    }

                    // More button (opens calendar)
                    Surface(
                        modifier = Modifier
                            .clickable { calendarSelectedDate = today; showCalendar = true },
                        shape = RoundedCornerShape(12.dp),
                        color = Color.White,
                        border = BorderStroke(1.dp, BorderColor)
                    ) {
                        Box(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("More", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextDark)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // === TIME PICKER ===
                Text("Select Time", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextDark)
                Spacer(modifier = Modifier.height(8.dp))

                WheelTimePicker(
                    initialHour = selectedHour,
                    initialMinute = selectedMinute,
                    initialIsPm = selectedIsPm,
                    onTimeSelected = { h, m, pm ->
                        selectedHour = h
                        selectedMinute = m
                        selectedIsPm = pm
                    }
                )

                // Conflict warning below picker
                if (hasConflict) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = DangerBg,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.Warning, contentDescription = null, tint = DangerRed, modifier = Modifier.size(18.dp))
                            Text(
                                text = "This time is within 10 minutes of a booked slot",
                                fontSize = 12.sp,
                                color = DangerRed,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // === BOOKED SLOTS ===
                Text("Booked Slots", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextDark)
                Spacer(modifier = Modifier.height(8.dp))

                when (slotsState) {
                    is UiState.Loading -> {
                        Box(
                            modifier = Modifier.fillMaxWidth().height(60.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(color = PrimaryNavy, modifier = Modifier.size(24.dp))
                        }
                    }
                    is UiState.Error -> {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = DangerBg,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = slotsState.message,
                                modifier = Modifier.padding(12.dp),
                                fontSize = 12.sp,
                                color = DangerRed
                            )
                        }
                    }
                    is UiState.Success -> {
                        if (bookedSlots.isEmpty()) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFF0FDF4),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(18.dp))
                                    Text("No slots booked for this date", fontSize = 12.sp, color = Color(0xFF16A34A), fontWeight = FontWeight.Medium)
                                }
                            }
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                bookedSlots.forEach { slot ->
                                    BookedSlotRow(slot = slot)
                                }
                            }
                        }
                    }
                    else -> {}
                }
            }

            // === BOTTOM BUTTONS ===
            Spacer(modifier = Modifier.height(12.dp))

            // Call type toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { selectedCallType = "Video" },
                    shape = RoundedCornerShape(10.dp),
                    color = if (selectedCallType == "Video") PrimaryNavy.copy(alpha = 0.1f) else Color.White,
                    border = BorderStroke(1.5.dp, if (selectedCallType == "Video") PrimaryNavy else BorderColor)
                ) {
                    Row(
                        modifier = Modifier.padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Videocam, contentDescription = null, tint = if (selectedCallType == "Video") PrimaryNavy else TextGray, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Video", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = if (selectedCallType == "Video") PrimaryNavy else TextGray)
                    }
                }
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { selectedCallType = "Audio" },
                    shape = RoundedCornerShape(10.dp),
                    color = if (selectedCallType == "Audio") PrimaryNavy.copy(alpha = 0.1f) else Color.White,
                    border = BorderStroke(1.5.dp, if (selectedCallType == "Audio") PrimaryNavy else BorderColor)
                ) {
                    Row(
                        modifier = Modifier.padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Call, contentDescription = null, tint = if (selectedCallType == "Audio") PrimaryNavy else TextGray, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Audio", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = if (selectedCallType == "Audio") PrimaryNavy else TextGray)
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Confirm button
            val timeLabel = formatTimeDisplay(selectedHour, selectedMinute, selectedIsPm)
            Button(
                onClick = {
                    if (hasConflict) {
                        conflictMessage = "The selected time ($timeLabel) is within 10 minutes of an existing booked slot. Please choose a different time."
                        showConflictDialog = true
                    } else {
                        onConfirmBooking(selectedDate, "$timeLabel-$timeLabel", selectedCallType)
                    }
                },
                enabled = scheduleState !is UiState.Loading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy)
            ) {
                if (scheduleState is UiState.Loading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                } else {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            if (selectedCallType == "Video") Icons.Default.Videocam else Icons.Default.Call,
                            contentDescription = null
                        )
                        Text("Book $selectedCallType Call", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
private fun BookedSlotRow(slot: BookedSlot) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = Color(0xFFFEF2F2),
        border = BorderStroke(1.dp, Color(0xFFFECACA)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = if (slot.callType == "video") Icons.Default.Videocam else Icons.Default.Call,
                    contentDescription = null,
                    tint = DangerRed,
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    text = slot.timeSlot,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = DangerRed
                )
            }
            Text(
                text = "Booked",
                fontSize = 12.sp,
                color = DangerRed,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
fun FullScreenSuccessDialog(onGoHome: () -> Unit) {
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

                Text("Booking Successful!", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = TextDark)
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Your call has been scheduled. You can find it in the 'Scheduled Calls' tab.",
                    fontSize = 16.sp,
                    color = TextGray,
                    textAlign = TextAlign.Center,
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

private fun parseTimeToMinutes(time: String): Int {
    val parts = time.trim().split(":")
    if (parts.size != 2) return 0
    val h = parts[0].toIntOrNull() ?: return 0
    val m = parts[1].toIntOrNull() ?: return 0
    return h * 60 + m
}

private fun formatTimeDisplay(hour: Int, minute: Int, isPm: Boolean): String {
    return "%d:%02d %s".format(hour, minute, if (isPm) "PM" else "AM")
}
