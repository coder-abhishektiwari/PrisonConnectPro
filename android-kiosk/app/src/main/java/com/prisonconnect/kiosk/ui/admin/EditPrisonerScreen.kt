package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.prisonconnect.kiosk.models.admin.EditPrisonerRequest
import com.prisonconnect.kiosk.models.admin.Prisoner
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.ui.components.KioskDateField
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import java.text.SimpleDateFormat
import java.util.Locale

private const val DATE_PATTERN = "yyyy-MM-dd"

private fun isAfterIso(start: String, end: String): Boolean {
    val s = start.trim()
    val e = end.trim()
    if (s.isEmpty() || e.isEmpty()) return false
    return try {
        val sdf = SimpleDateFormat(DATE_PATTERN, Locale.US).apply { isLenient = false }
        val sd = sdf.parse(s) ?: return false
        val ed = sdf.parse(e) ?: return false
        sd.after(ed)
    } catch (_: Exception) {
        false
    }
}

@Composable
fun EditPrisonerScreen(
    prisonerId: String,
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    viewModel: EditPrisonerViewModel = hiltViewModel()
) {
    val prisonerResult by viewModel.prisoner.collectAsState()
    val updateResult by viewModel.updateState.collectAsState()
    val resetPinResult by viewModel.resetPinState.collectAsState()

    LaunchedEffect(prisonerId) {
        viewModel.loadPrisoner(prisonerId)
    }

    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Edit Prisoner",
                showBackButton = true,
                onBackClick = onBackClick
            )
        },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues).fillMaxSize()) {
            when (val result = prisonerResult) {
                is NetworkResult.Loading -> {
                    KioskLoadingState(modifier = Modifier.align(Alignment.Center))
                }
                is NetworkResult.Success -> {
                    EditPrisonerForm(
                        prisoner = result.data,
                        onUpdate = { request -> viewModel.updatePrisoner(prisonerId, request) },
                        onResetPin = { pin -> viewModel.resetPin(prisonerId, pin) },
                        onResetPinDismissed = { viewModel.resetResetPinState() },
                        resetPinResult = resetPinResult
                    )
                }
                is NetworkResult.Failure -> {
                    Text(
                        text = result.error.message ?: "Failed to load prisoner",
                        color = Color(0xFFD32F2F),
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                else -> {}
            }

            if (updateResult is NetworkResult.Loading) {
                KioskLoadingState(modifier = Modifier.align(Alignment.Center))
            }

            LaunchedEffect(updateResult) {
                if (updateResult is NetworkResult.Success) {
                    onBackClick()
                }
            }
        }
    }
}

@Composable
fun EditPrisonerForm(
    prisoner: Prisoner,
    onUpdate: (EditPrisonerRequest) -> Unit,
    onResetPin: (String) -> Unit,
    onResetPinDismissed: () -> Unit,
    resetPinResult: NetworkResult<String>
) {
    var fullName by remember(prisoner.inmateId) { mutableStateOf(prisoner.displayName) }
    var mobileNumber by remember(prisoner.inmateId) { mutableStateOf(prisoner.mobileNumber ?: "") }
    var prisonerNumber by remember(prisoner.inmateId) { mutableStateOf(prisoner.prisonerNumber ?: "") }
    var dateOfBirth by remember(prisoner.inmateId) { mutableStateOf(prisoner.dateOfBirth ?: "") }
    var dateOfAdmission by remember(prisoner.inmateId) { mutableStateOf(prisoner.dateOfAdmission ?: "") }
    var gender by remember(prisoner.inmateId) { mutableStateOf(prisoner.gender ?: "") }
    var cellBlock by remember(prisoner.inmateId) { mutableStateOf(prisoner.cellBlock ?: "") }
    var cellId by remember(prisoner.inmateId) { mutableStateOf(prisoner.cellId ?: "") }
    var blockId by remember(prisoner.inmateId) { mutableStateOf(prisoner.blockId ?: "") }
    var securityLevel by remember(prisoner.inmateId) { mutableStateOf(prisoner.securityLevel ?: "medium") }
    var sentenceStart by remember(prisoner.inmateId) { mutableStateOf(prisoner.sentenceStart ?: "") }
    var sentenceEnd by remember(prisoner.inmateId) { mutableStateOf(prisoner.sentenceEnd ?: "") }
    var sentenceDetails by remember(prisoner.inmateId) { mutableStateOf(prisoner.sentenceDetails ?: "") }
    var assignedKioskId by remember(prisoner.inmateId) { mutableStateOf(prisoner.assignedKioskId ?: "") }
    var status by remember(prisoner.inmateId) { mutableStateOf(prisoner.status) }
    var active by remember(prisoner.inmateId) { mutableStateOf(prisoner.active) }
    var showSaveDialog by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf("") }
    var showResetPinDialog by remember { mutableStateOf(false) }
    var resetPinValue by remember { mutableStateOf("") }
    var resetPinError by remember { mutableStateOf("") }
    var resetPinSuccess by remember { mutableStateOf(false) }

    val resetPinLoading = resetPinResult is NetworkResult.Loading
    LaunchedEffect(resetPinResult) {
        if (resetPinResult is NetworkResult.Success) {
            resetPinSuccess = true
            resetPinValue = ""
            resetPinError = ""
        } else if (resetPinResult is NetworkResult.Failure) {
            resetPinError = resetPinResult.error.message ?: "Failed to reset PIN"
        }
    }

    val submit: () -> Unit = {
        if (fullName.isBlank()) {
            saveError = "Full name is required"
        } else if (isAfterIso(sentenceStart, sentenceEnd)) {
            saveError = "Sentence end must be after sentence start"
        } else {
            saveError = ""
            onUpdate(
                EditPrisonerRequest(
                    name = fullName.trim(),
                    mobileNumber = mobileNumber.ifBlank { null },
                    prisonerNumber = prisonerNumber.ifBlank { null },
                    dateOfBirth = dateOfBirth.ifBlank { null },
                    dateOfAdmission = dateOfAdmission.ifBlank { null },
                    gender = gender.ifBlank { null },
                    cellBlock = cellBlock.ifBlank { null },
                    cellId = cellId.ifBlank { null },
                    blockId = blockId.ifBlank { null },
                    securityLevel = securityLevel.ifBlank { null },
                    sentenceStart = sentenceStart.ifBlank { null },
                    sentenceEnd = sentenceEnd.ifBlank { null },
                    sentenceDetails = sentenceDetails.ifBlank { null },
                    assignedKioskId = assignedKioskId.ifBlank { null },
                    status = status,
                    active = active
                )
            )
        }
    }

    if (showSaveDialog) {
        AlertDialog(
            onDismissRequest = { showSaveDialog = false },
            title = { Text("Save Changes") },
            text = { Text("Are you sure you want to save these changes?") },
            confirmButton = {
                TextButton(onClick = { showSaveDialog = false }) {
                    Text("Cancel")
                }
                TextButton(onClick = {
                    showSaveDialog = false
                    submit()
                }) {
                    Text("Save", color = Color(0xFF003366))
                }
            },
            dismissButton = {}
        )
    }

    if (showResetPinDialog) {
        AlertDialog(
            onDismissRequest = {
                showResetPinDialog = false
                resetPinValue = ""
                resetPinError = ""
                resetPinSuccess = false
                onResetPinDismissed()
            },
            title = { Text("Reset PIN") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (resetPinSuccess) {
                        Text("PIN reset successfully!", color = Color(0xFF2E7D32))
                    } else {
                        if (resetPinError.isNotEmpty()) {
                            Text(resetPinError, color = Color(0xFFD32F2F), fontSize = 13.sp)
                        }
                        Text("Enter a new 6-digit PIN for ${prisoner.displayName}", fontSize = 14.sp)
                        OutlinedTextField(
                            value = resetPinValue,
                            onValueChange = {
                                if (it.length <= 6 && it.all { c -> c.isDigit() }) {
                                    resetPinValue = it
                                    resetPinError = ""
                                }
                            },
                            label = { Text("New PIN") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            isError = resetPinValue.isNotEmpty() && resetPinValue.length != 6,
                            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                                keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword
                            )
                        )
                        if (resetPinValue.isNotEmpty() && resetPinValue.length != 6) {
                            Text(
                                "PIN must be exactly 6 digits",
                                color = Color(0xFFD32F2F),
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            },
            confirmButton = {
                if (!resetPinSuccess) {
                    TextButton(
                        enabled = !resetPinLoading,
                        onClick = {
                            if (resetPinValue.length != 6) {
                                resetPinError = "PIN must be exactly 6 digits"
                            } else {
                                resetPinError = ""
                                onResetPin(resetPinValue)
                            }
                        }
                    ) {
                        if (resetPinLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("Reset")
                        }
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showResetPinDialog = false
                    resetPinValue = ""
                    resetPinError = ""
                    resetPinSuccess = false
                    onResetPinDismissed()
                }) {
                    Text(if (resetPinSuccess) "Close" else "Cancel")
                }
            }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (saveError.isNotEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFDECEA))
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Error, contentDescription = null, tint = Color(0xFFD32F2F))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(saveError, color = Color(0xFFD32F2F), fontSize = 14.sp)
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(2.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Prisoner Information", fontSize = 20.sp, fontWeight = FontWeight.Bold)

                OutlinedTextField(
                    value = fullName,
                    onValueChange = { fullName = it; saveError = "" },
                    label = { Text("Full Name *") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                OutlinedTextField(
                    value = prisonerNumber,
                    onValueChange = { prisonerNumber = it },
                    label = { Text("Prisoner Number") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                OutlinedTextField(
                    value = mobileNumber,
                    onValueChange = { if (it.length <= 15 && it.all(Char::isDigit)) mobileNumber = it },
                    label = { Text("Mobile Number") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone
                    )
                )

                KioskDateField(
                    value = dateOfBirth,
                    onValueChange = { dateOfBirth = it },
                    label = "Date of Birth"
                )

                Text("Gender", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SelectPill(
                        label = "Male",
                        selected = gender == "male",
                        onClick = { gender = "male" },
                        modifier = Modifier.weight(1f),
                        color = Color(0xFF003366)
                    )
                    SelectPill(
                        label = "Female",
                        selected = gender == "female",
                        onClick = { gender = "female" },
                        modifier = Modifier.weight(1f),
                        color = Color(0xFFC2185B)
                    )
                    SelectPill(
                        label = "Other",
                        selected = gender == "other",
                        onClick = { gender = "other" },
                        modifier = Modifier.weight(1f),
                        color = Color(0xFF7B1FA2)
                    )
                }

                KioskDateField(
                    value = dateOfAdmission,
                    onValueChange = { dateOfAdmission = it },
                    label = "Date of Admission"
                )

                OutlinedTextField(
                    value = cellBlock,
                    onValueChange = { cellBlock = it },
                    label = { Text("Cell Block") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = cellId,
                        onValueChange = { cellId = it },
                        label = { Text("Cell ID") },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = blockId,
                        onValueChange = { blockId = it },
                        label = { Text("Block ID") },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }

                Text("Security Level", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SecurityLevelOption(
                        label = "Low",
                        selected = securityLevel == "low",
                        onClick = { securityLevel = "low" },
                        modifier = Modifier.weight(1f),
                        color = Color(0xFF4CAF50)
                    )
                    SecurityLevelOption(
                        label = "Medium",
                        selected = securityLevel == "medium",
                        onClick = { securityLevel = "medium" },
                        modifier = Modifier.weight(1f),
                        color = Color(0xFFFF9800)
                    )
                    SecurityLevelOption(
                        label = "High",
                        selected = securityLevel == "high",
                        onClick = { securityLevel = "high" },
                        modifier = Modifier.weight(1f),
                        color = Color(0xFFF44336)
                    )
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(2.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Sentence", fontSize = 18.sp, fontWeight = FontWeight.Bold)

                KioskDateField(
                    value = sentenceStart,
                    onValueChange = { sentenceStart = it },
                    label = "Sentence Start"
                )

                KioskDateField(
                    value = sentenceEnd,
                    onValueChange = { sentenceEnd = it },
                    label = "Sentence End"
                )

                OutlinedTextField(
                    value = sentenceDetails,
                    onValueChange = { sentenceDetails = it },
                    label = { Text("Sentence Details") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )

                OutlinedTextField(
                    value = assignedKioskId,
                    onValueChange = { assignedKioskId = it },
                    label = { Text("Assigned Kiosk ID") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(2.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Status & Access", fontSize = 18.sp, fontWeight = FontWeight.Bold)

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = active, onCheckedChange = { active = it })
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(if (active) "Active" else "Suspended")
                }

                OutlinedButton(
                    onClick = {
                        showResetPinDialog = true
                        resetPinSuccess = false
                        resetPinError = ""
                        resetPinValue = ""
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.LockReset, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Reset PIN")
                }
            }
        }

        Button(
            onClick = { showSaveDialog = true },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF003366))
        ) {
            Icon(Icons.Default.Save, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Save Changes", fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun SelectPill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color
) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) color else Color.White,
        border = BorderStroke(1.dp, if (selected) color else Color(0xFFE2E8F0))
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(vertical = 16.dp),
            textAlign = TextAlign.Center,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            color = if (selected) Color.White else Color(0xFF0B2240)
        )
    }
}
