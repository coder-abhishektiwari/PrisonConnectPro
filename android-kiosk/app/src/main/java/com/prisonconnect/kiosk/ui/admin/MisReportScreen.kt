package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.core.ReportPrinter
import com.prisonconnect.kiosk.models.report.CallsMisReport
import com.prisonconnect.kiosk.models.report.MisDuration
import com.prisonconnect.kiosk.models.report.MisSummary
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DISPLAY_DAY: DateTimeFormatter = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH)

@Composable
fun MisReportScreen(
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    viewModel: MisReportViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current

    MisReportContent(
        state = state,
        onBackClick = onBackClick,
        onPresetClick = viewModel::applyPreset,
        onFromSelected = viewModel::setFrom,
        onToSelected = viewModel::setTo,
        onGenerate = viewModel::generate,
        onPrint = { text -> ReportPrinter.print(context, "MIS Calls Report", text) }
    )
}

@Composable
fun MisReportContent(
    state: MisReportViewModel.UiState,
    onBackClick: () -> Unit,
    onPresetClick: (MisReportViewModel.Preset) -> Unit,
    onFromSelected: (Long) -> Unit,
    onToSelected: (Long) -> Unit,
    onGenerate: () -> Unit,
    onPrint: (String) -> Unit
) {
    var showFromPicker by remember { mutableStateOf(false) }
    var showToPicker by remember { mutableStateOf(false) }

    if (showFromPicker) {
        ReportDatePicker(
            initialDate = state.from,
            title = "From",
            onConfirmed = { millis ->
                showFromPicker = false
                if (millis != null) onFromSelected(millis)
            },
            onDismissed = { showFromPicker = false }
        )
    }
    if (showToPicker) {
        ReportDatePicker(
            initialDate = state.to,
            title = "To",
            onConfirmed = { millis ->
                showToPicker = false
                if (millis != null) onToSelected(millis)
            },
            onDismissed = { showToPicker = false }
        )
    }

    Scaffold(
        topBar = {
            KioskTopBar(
                title = "MIS Calls Report",
                showBackButton = true,
                onBackClick = onBackClick
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
                        Text(
                            text = "REPORT PERIOD",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0B2240)
                        )

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            PresetChip("Today", MisReportViewModel.Preset.TODAY, state.preset, onPresetClick)
                            PresetChip("Yesterday", MisReportViewModel.Preset.YESTERDAY, state.preset, onPresetClick)
                            PresetChip("This week", MisReportViewModel.Preset.THIS_WEEK, state.preset, onPresetClick)
                            PresetChip("This month", MisReportViewModel.Preset.THIS_MONTH, state.preset, onPresetClick)
                            PresetChip("Custom", MisReportViewModel.Preset.CUSTOM, state.preset, onPresetClick)
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            DateField(
                                label = "From",
                                value = state.from.format(DISPLAY_DAY),
                                onClick = { showFromPicker = true },
                                modifier = Modifier.weight(1f)
                            )
                            DateField(
                                label = "To",
                                value = state.to.format(DISPLAY_DAY),
                                onClick = { showToPicker = true },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }

            item {
                Button(
                    onClick = onGenerate,
                    enabled = !state.isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF003366))
                ) {
                    if (state.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("Generating...", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    } else {
                        Icon(Icons.Default.DateRange, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Generate Report", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            if (state.error != null && !state.isLoading) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE))
                    ) {
                        Row(
                            modifier = Modifier.padding(20.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Error,
                                contentDescription = null,
                                tint = Color(0xFFD32F2F)
                            )
                            Text(
                                text = state.error,
                                fontSize = 14.sp,
                                color = Color(0xFFB71C1C),
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }

            if (state.reportText != null) {
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
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "REPORT PREVIEW",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0B2240)
                                )
                                Text(
                                    text = "80 mm receipt",
                                    fontSize = 12.sp,
                                    color = Color(0xFF687A8F)
                                )
                            }
                            HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 1.dp)
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState())
                            ) {
                                Text(
                                    text = state.reportText,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 12.sp,
                                    lineHeight = 16.sp,
                                    color = Color(0xFF0B2240),
                                    softWrap = false,
                                    maxLines = 500
                                )
                            }
                        }
                    }
                }

                item {
                    Button(
                        onClick = { onPrint(state.reportText) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50))
                    ) {
                        Icon(Icons.Default.Print, contentDescription = null, tint = Color.White)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Print Report",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }
            }

            item { Spacer(modifier = Modifier.height(8.dp)) }
        }
    }
}

@Composable
private fun PresetChip(
    label: String,
    preset: MisReportViewModel.Preset,
    selected: MisReportViewModel.Preset,
    onPresetClick: (MisReportViewModel.Preset) -> Unit
) {
    FilterChip(
        selected = selected == preset,
        onClick = { onPresetClick(preset) },
        label = { Text(label, fontSize = 13.sp) }
    )
}

@Composable
private fun DateField(
    label: String,
    value: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF687A8F)
        )
        OutlinedButton(
            onClick = onClick,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp)
        ) {
            Text(
                text = value,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0xFF0B2240),
                maxLines = 1
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReportDatePicker(
    initialDate: LocalDate,
    title: String,
    onConfirmed: (Long?) -> Unit,
    onDismissed: () -> Unit
) {
    val pickerState = rememberDatePickerState(
        initialSelectedDateMillis = initialDate.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    )
    DatePickerDialog(
        onDismissRequest = onDismissed,
        confirmButton = {
            TextButton(onClick = { onConfirmed(pickerState.selectedDateMillis) }) {
                Text("OK")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismissed) {
                Text("Cancel")
            }
        }
    ) {
        Column {
            Text(
                text = "Select $title",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0B2240),
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp)
            )
            DatePicker(
                state = pickerState,
                showModeToggle = false
            )
        }
    }
}

// --- PREVIEWS ---

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewMisReportMobile() {
    PrisonKioskTheme {
        val report = CallsMisReport(
            kioskId = "KIOSK-A1B2C3D4",
            prisonName = "Central Jail Pune",
            summary = MisSummary(
                totalCalls = 428,
                completed = 361,
                notAnswered = 52,
                forceEnded = 15,
                video = 244,
                audio = 184
            ),
            duration = MisDuration(
                connectedCalls = 361,
                totalTalkSeconds = 1_485_000,
                averageSeconds = 432,
                longestSeconds = 1_785,
                shortestSeconds = 8
            )
        )
        MisReportContent(
            state = MisReportViewModel.UiState(
                preset = MisReportViewModel.Preset.THIS_WEEK,
                from = LocalDate.of(2025, 10, 1),
                to = LocalDate.of(2025, 10, 7),
                report = report,
                reportText = com.prisonconnect.kiosk.core.MisReportFormatter.build(report, "EMP-SA001")
            ),
            onBackClick = {},
            onPresetClick = {},
            onFromSelected = {},
            onToSelected = {},
            onGenerate = {},
            onPrint = {}
        )
    }
}
