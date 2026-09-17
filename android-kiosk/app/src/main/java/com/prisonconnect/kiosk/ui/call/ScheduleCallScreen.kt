package com.prisonconnect.kiosk.ui.call

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.schedule.BookedSlot
import com.prisonconnect.kiosk.models.schedule.SlotsResponse
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.components.WheelTimePicker
import com.prisonconnect.kiosk.ui.theme.*
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

private enum class ScheduleStep { DATE, TIME, CONFIRM }

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

    var currentStep by remember { mutableStateOf(ScheduleStep.DATE) }
    var selectedDate by remember { mutableStateOf(LocalDate.now()) }
    var selectedTimeLabel by remember { mutableStateOf("") }
    var selectedHour by remember { mutableIntStateOf(9) }
    var selectedMinute by remember { mutableIntStateOf(0) }
    var selectedIsPm by remember { mutableStateOf(false) }
    var selectedCallType by remember { mutableStateOf(if (initialCallType.equals("Audio", true)) "Audio" else "Video") }

    val dateFmt = remember { DateTimeFormatter.ofPattern("yyyy-MM-dd") }

    val localSlotsState = slotsState
    val bookedSlots = remember(localSlotsState) {
        when (localSlotsState) {
            is UiState.Success -> localSlotsState.data.bookedSlots
            else -> emptyList()
        }
    }

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

    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Schedule Call",
                showBackButton = true,
                onBackClick = {
                    when (currentStep) {
                        ScheduleStep.TIME -> currentStep = ScheduleStep.DATE
                        ScheduleStep.CONFIRM -> currentStep = ScheduleStep.TIME
                        ScheduleStep.DATE -> onBack()
                    }
                }
            )
        },
        containerColor = LightBg
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(bottom = 8.dp, top = 8.dp)
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
                    Text(if (selectedCallType == "Video") "Video Call" else "Audio Call", fontSize = 12.sp, color = TextGray)
                }
            }

            StepIndicator(currentStep)
            Spacer(modifier = Modifier.height(16.dp))

            Box(modifier = Modifier.weight(1f)) {
                when (currentStep) {
                    ScheduleStep.DATE -> DateStep(
                        selectedDate = selectedDate,
                        onDateSelected = { date ->
                            selectedDate = date
                            viewModel.loadBookedSlots(date.format(dateFmt))
                            currentStep = ScheduleStep.TIME
                        }
                    )
                    ScheduleStep.TIME -> TimeStep(
                        selectedHour = selectedHour,
                        selectedMinute = selectedMinute,
                        selectedIsPm = selectedIsPm,
                        hasConflict = hasConflict,
                        onTimeChanged = { h, m, pm -> selectedHour = h; selectedMinute = m; selectedIsPm = pm },
                        onConfirmTime = {
                            selectedTimeLabel = formatTimeDisplay(selectedHour, selectedMinute, selectedIsPm)
                            currentStep = ScheduleStep.CONFIRM
                        }
                    )
                    ScheduleStep.CONFIRM -> ConfirmStep(
                        selectedDate = selectedDate,
                        selectedTime = selectedTimeLabel,
                        selectedCallType = selectedCallType,
                        hasConflict = hasConflict,
                        scheduleState = scheduleState,
                        onBook = { viewModel.scheduleCall(contactId, selectedDate.format(dateFmt), "$selectedTimeLabel-$selectedTimeLabel", selectedCallType) },
                        onGoHome = onBackToHome,
                        onBackToTime = { currentStep = ScheduleStep.TIME }
                    )
                }
            }
        }
    }
}

@Composable
private fun StepIndicator(currentStep: ScheduleStep) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        val steps = listOf(ScheduleStep.DATE to "Date", ScheduleStep.TIME to "Time", ScheduleStep.CONFIRM to "Confirm")
        steps.forEachIndexed { index, (step, label) ->
            val isActive = currentStep.ordinal >= step.ordinal
            val isCurrent = currentStep == step
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Surface(
                    modifier = Modifier.size(32.dp),
                    shape = CircleShape,
                    color = if (isActive) PrimaryNavy else BorderColor
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (isActive && !isCurrent) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        } else {
                            Text("${index + 1}", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = if (isActive) Color.White else Color.Gray)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(label, fontSize = 11.sp, fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal, color = if (isActive) PrimaryNavy else TextGray)
            }
            if (index < steps.lastIndex) {
                Surface(
                    modifier = Modifier.weight(1f).padding(horizontal = 4.dp).height(2.dp),
                    color = if (currentStep.ordinal > step.ordinal) PrimaryNavy else BorderColor
                ) {}
            }
        }
    }
}

@Composable
private fun DateStep(selectedDate: LocalDate, onDateSelected: (LocalDate) -> Unit) {
    val today = remember { LocalDate.now() }
    var viewMonth by remember { mutableStateOf(YearMonth.from(selectedDate)) }

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(
            color = Color.White,
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Select Date", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextDark)

                Spacer(modifier = Modifier.height(12.dp))

                // Month header with arrows
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { viewMonth = viewMonth.minusMonths(1) }) {
                        Icon(Icons.Default.ChevronLeft, contentDescription = "Previous", tint = TextDark)
                    }
                    Text(
                        text = viewMonth.format(DateTimeFormatter.ofPattern("MMMM yyyy")),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextDark
                    )
                    IconButton(onClick = { viewMonth = viewMonth.plusMonths(1) }) {
                        Icon(Icons.Default.ChevronRight, contentDescription = "Next", tint = TextDark)
                    }
                }

                // Day of week headers
                Row(modifier = Modifier.fillMaxWidth()) {
                    listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun").forEach { day ->
                        Text(
                            text = day,
                            modifier = Modifier.weight(1f),
                            textAlign = TextAlign.Center,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextGray
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Calendar grid
                val firstDayOfMonth = viewMonth.atDay(1)
                val daysInMonth = viewMonth.lengthOfMonth()
                val startDayOfWeek = (firstDayOfMonth.dayOfWeek.value - 1) // Mon=0

                val totalCells = startDayOfWeek + daysInMonth
                val rows = (totalCells + 6) / 7

                for (row in 0 until rows) {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        for (col in 0 until 7) {
                            val dayIndex = row * 7 + col - startDayOfWeek + 1
                            if (dayIndex in 1..daysInMonth) {
                                val date = viewMonth.atDay(dayIndex)
                                val isPast = date.isBefore(today)
                                val isSelected = date == selectedDate
                                val isToday = date == today

                                Surface(
                                    modifier = Modifier
                                        .weight(1f)
                                        .aspectRatio(1f)
                                        .padding(2.dp)
                                        .clickable(enabled = !isPast) { onDateSelected(date) },
                                    shape = CircleShape,
                                    color = when {
                                        isSelected -> PrimaryNavy
                                        isToday -> PrimaryNavy.copy(alpha = 0.1f)
                                        else -> Color.Transparent
                                    }
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = "$dayIndex",
                                            fontSize = 13.sp,
                                            fontWeight = if (isSelected || isToday) FontWeight.Bold else FontWeight.Normal,
                                            color = when {
                                                isSelected -> Color.White
                                                isPast -> Color.LightGray
                                                isToday -> PrimaryNavy
                                                else -> TextDark
                                            }
                                        )
                                    }
                                }
                            } else {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Quick date buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    val quickDates = listOf(today to "Today", today.plusDays(1) to "Tmrw", today.plusDays(2) to today.plusDays(2).format(DateTimeFormatter.ofPattern("EEE")))
                    quickDates.forEach { (date, label) ->
                        val isSelected = selectedDate == date
                        Surface(
                            modifier = Modifier.weight(1f).clickable { onDateSelected(date) },
                            shape = RoundedCornerShape(10.dp),
                            color = if (isSelected) PrimaryNavy else Color.White,
                            border = if (isSelected) null else BorderStroke(1.dp, BorderColor)
                        ) {
                            Box(modifier = Modifier.padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                                Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (isSelected) Color.White else TextDark, textAlign = TextAlign.Center)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TimeStep(
    selectedHour: Int,
    selectedMinute: Int,
    selectedIsPm: Boolean,
    hasConflict: Boolean,
    onTimeChanged: (Int, Int, Boolean) -> Unit,
    onConfirmTime: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(
            color = Color.White,
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Select Time", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextDark)
                Spacer(modifier = Modifier.height(12.dp))

                WheelTimePicker(
                    initialHour = selectedHour,
                    initialMinute = selectedMinute,
                    initialIsPm = selectedIsPm,
                    onTimeSelected = onTimeChanged
                )

                if (hasConflict) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Surface(shape = RoundedCornerShape(10.dp), color = DangerBg, modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.Warning, contentDescription = null, tint = DangerRed, modifier = Modifier.size(18.dp))
                            Text("This time is within 10 min of a booked slot", fontSize = 12.sp, color = DangerRed, fontWeight = FontWeight.Medium)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onConfirmTime,
                    enabled = !hasConflict,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy, disabledContainerColor = PrimaryNavy.copy(alpha = 0.5f))
                ) {
                    Text("Confirm Time", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color.White)
                }
            }
        }
    }
}

@Composable
private fun ConfirmStep(
    selectedDate: LocalDate,
    selectedTime: String,
    selectedCallType: String,
    hasConflict: Boolean,
    scheduleState: UiState<Unit>,
    onBook: () -> Unit,
    onGoHome: () -> Unit,
    onBackToTime: () -> Unit
) {
    val displayDate = remember(selectedDate) {
        selectedDate.format(DateTimeFormatter.ofPattern("EEE, MMM d, yyyy"))
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Surface(
            color = Color.White,
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                when (scheduleState) {
                    is UiState.Loading -> {
                        CircularProgressIndicator(color = PrimaryNavy, modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Booking your slot...", fontSize = 16.sp, color = TextGray)
                    }
                    is UiState.Success -> {
                        // BOOKED
                        Surface(modifier = Modifier.size(80.dp), shape = CircleShape, color = Color(0xFFE8F5E9)) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(50.dp))
                            }
                        }
                        Spacer(modifier = Modifier.height(20.dp))
                        Text("Slot Booked!", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextDark)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("$displayDate at $selectedTime", fontSize = 14.sp, color = TextGray)
                        Spacer(modifier = Modifier.height(24.dp))
                        Button(onClick = onGoHome, modifier = Modifier.fillMaxWidth().height(48.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy)) {
                            Text("Go to Home", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color.White)
                        }
                    }
                    is UiState.Error -> {
                        // UNAVAILABLE
                        Surface(modifier = Modifier.size(80.dp), shape = CircleShape, color = DangerBg) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.Warning, contentDescription = null, tint = DangerRed, modifier = Modifier.size(50.dp))
                            }
                        }
                        Spacer(modifier = Modifier.height(20.dp))
                        Text("Slot Unavailable", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextDark)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Someone has scheduled a call at this time. Choose another slot.", fontSize = 14.sp, color = TextGray, textAlign = TextAlign.Center)
                        Spacer(modifier = Modifier.height(24.dp))
                        Button(onClick = onBackToTime, modifier = Modifier.fillMaxWidth().height(48.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy)) {
                            Text("Go Back", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        }
                    }
                    else -> {
                        // AVAILABLE — show summary + book
                        Surface(modifier = Modifier.size(80.dp), shape = CircleShape, color = AccentGreenBg) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = AccentGreen, modifier = Modifier.size(50.dp))
                            }
                        }
                        Spacer(modifier = Modifier.height(20.dp))
                        Text("Slot Available!", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextDark)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Slot is available to book", fontSize = 14.sp, color = AccentGreen, fontWeight = FontWeight.Medium)
                        Spacer(modifier = Modifier.height(20.dp))

                        Surface(modifier = Modifier.fillMaxWidth(), color = LightBg, shape = RoundedCornerShape(12.dp)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Date", fontSize = 13.sp, color = TextGray); Text(displayDate, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = TextDark)
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Time", fontSize = 13.sp, color = TextGray); Text(selectedTime, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = TextDark)
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Call Type", fontSize = 13.sp, color = TextGray); Text(selectedCallType, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = PrimaryNavy)
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(24.dp))
                        Button(onClick = onBook, modifier = Modifier.fillMaxWidth().height(48.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy)) {
                            Icon(Icons.Default.PhoneInTalk, contentDescription = null, tint = Color.White)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Book Now", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color.White)
                        }
                    }
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

@Composable
fun ScheduleDetailDialog(
    contactId: String,
    contactName: String,
    date: String,
    timeSlot: String,
    callType: String,
    status: String,
    scheduleId: String = "",
    onDismiss: () -> Unit,
    onStartCall: (contactId: String, roomId: String, isVideo: Boolean) -> Unit,
    onCancelSchedule: ((scheduleId: String) -> Unit)? = null,
    viewModel: RoomViewModel = hiltViewModel()
) {
    val createRoomState by viewModel.createRoomState.collectAsState()
    val isVideo = callType.equals("Video", ignoreCase = true)

    val scheduledDateTime = remember(date, timeSlot) {
        parseScheduledDateTime(date, timeSlot.split("-").firstOrNull()?.trim() ?: "")
    }

    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            kotlinx.coroutines.delay(1000)
        }
    }

    val remainingMillis = remember(now, scheduledDateTime) {
        (scheduledDateTime - now).coerceAtLeast(0)
    }
    val isTimeReady = remainingMillis <= 0

    val days = remainingMillis / (1000 * 60 * 60 * 24)
    val hours = (remainingMillis / (1000 * 60 * 60)) % 24
    val minutes = (remainingMillis / (1000 * 60)) % 60
    val seconds = (remainingMillis / 1000) % 60

    val countdownText = if (isTimeReady) "Ready to call"
    else buildString {
        if (days > 0) append("${days}d ")
        if (hours > 0 || days > 0) append("${hours}h ")
        if (minutes > 0 || hours > 0 || days > 0) append("${minutes}m ")
        append("${seconds}s")
    }

    LaunchedEffect(createRoomState) {
        val s = createRoomState
        if (s is UiState.Success) {
            onStartCall("", s.data.sessionId, isVideo)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(24.dp),
        containerColor = Color.White,
        title = {
            Column {
                Text(
                    text = contactName,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextDark
                )
                Spacer(modifier = Modifier.height(4.dp))
                Surface(
                    color = if (status.equals("booked", true)) AccentGreenBg else Color.Gray.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Text(
                        text = status.replaceFirstChar { it.uppercase() },
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (status.equals("booked", true)) AccentGreen else Color.Gray,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                    )
                }
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = LightBg,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        DetailRow(label = "Date", value = date)
                        Spacer(modifier = Modifier.height(8.dp))
                        DetailRow(label = "Time", value = timeSlot)
                        Spacer(modifier = Modifier.height(8.dp))
                        DetailRow(label = "Call Type", value = callType)
                    }
                }

                val isCreatingRoom = createRoomState is UiState.Loading

                Button(
                    onClick = { viewModel.createRoom(contactId, callType) },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isTimeReady) PrimaryNavy else Color(0xFFB0BEC5)
                    ),
                    enabled = isTimeReady && !isCreatingRoom
                ) {
                    if (isCreatingRoom) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                    } else if (!isTimeReady) {
                        Icon(Icons.Default.AccessTime, contentDescription = null, tint = TextDark)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("$countdownText left", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = TextDark)
                    } else {
                        Icon(Icons.Default.PhoneInTalk, contentDescription = null, tint = Color.White)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Start Call", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color.White)
                    }
                }

                if (onCancelSchedule != null && scheduleId.isNotEmpty() && (status.equals("booked", true) || status.equals("scheduled", true))) {
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { onCancelSchedule(scheduleId) },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Red),
                        border = BorderStroke(1.dp, Color.Red.copy(alpha = 0.5f))
                    ) {
                        Icon(Icons.Default.Cancel, contentDescription = null, tint = Color.Red)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Cancel Schedule", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color.Red)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {}
    )
}

private fun parseScheduledDateTime(dateStr: String, timeStr: String): Long {
    return try {
        val date = LocalDate.parse(dateStr, DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        val time = parseTimeFlexible(timeStr)
        if (time != null) {
            LocalDateTime.of(date, time).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        } else 0L
    } catch (_: Exception) {
        0L
    }
}

private fun parseTimeFlexible(timeStr: String): LocalTime? {
    val formats = listOf("h:mm a", "HH:mm", "h:mma", "HH:mm:ss")
    for (fmt in formats) {
        try {
            return LocalTime.parse(timeStr, DateTimeFormatter.ofPattern(fmt, java.util.Locale.ENGLISH))
        } catch (_: Exception) { }
    }
    return null
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, fontSize = 13.sp, color = TextGray)
        Text(text = value, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = TextDark)
    }
}

