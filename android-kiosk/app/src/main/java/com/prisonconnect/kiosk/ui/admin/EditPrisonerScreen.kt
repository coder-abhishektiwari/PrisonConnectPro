package com.prisonconnect.kiosk.ui.admin

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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.models.admin.Prisoner
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.components.KioskTopBar

@Composable
fun EditPrisonerScreen(
    prisonerId: String,
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    viewModel: EditPrisonerViewModel = hiltViewModel()
) {
    val prisonerResult by viewModel.prisoner.collectAsState()
    val updateResult by viewModel.updateState.collectAsState()

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
                        onUpdate = { fullName, mobile, prisonerNum, dateAdm, cellId, blockId, security, sentenceStart, sentenceEnd, details, kioskId, status, active ->
                            viewModel.updatePrisoner(prisonerId, fullName, mobile, prisonerNum, dateAdm, cellId, blockId, security, sentenceStart, sentenceEnd, details, kioskId, status, active)
                        }
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
    onUpdate: (String, String, String, String, String, String, String, String, String, String, String, String, Boolean) -> Unit
) {
    var fullName by remember { mutableStateOf(prisoner.fullName ?: "") }
    var mobileNumber by remember { mutableStateOf(prisoner.mobileNumber ?: "") }
    var prisonerNumber by remember { mutableStateOf(prisoner.prisonerNumber ?: "") }
    var dateOfAdmission by remember { mutableStateOf(prisoner.dateOfAdmission ?: "") }
    var cellId by remember { mutableStateOf(prisoner.cellBlock ?: "") }
    var blockId by remember { mutableStateOf("") }
    var securityLevel by remember { mutableStateOf(prisoner.securityLevel ?: "medium") }
    var sentenceStart by remember { mutableStateOf("") }
    var sentenceEnd by remember { mutableStateOf("") }
    var sentenceDetails by remember { mutableStateOf(prisoner.sentenceDetails ?: "") }
    var assignedKioskId by remember { mutableStateOf(prisoner.assignedDeviceId ?: "") }
    var status by remember { mutableStateOf(prisoner.status) }
    var active by remember { mutableStateOf(prisoner.active) }
    var showSaveDialog by remember { mutableStateOf(false) }
    var showResetPinDialog by remember { mutableStateOf(false) }
    var resetPinValue by remember { mutableStateOf("") }
    var resetPinError by remember { mutableStateOf("") }
    var resetPinSuccess by remember { mutableStateOf(false) }

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
                    onUpdate(fullName, mobileNumber, prisonerNumber, dateOfAdmission, cellId, blockId, securityLevel, sentenceStart, sentenceEnd, sentenceDetails, assignedKioskId, status, active)
                }) {
                    Text("Save", color = Color(0xFF003366))
                }
            },
            dismissButton = {}
        )
    }

    if (showResetPinDialog) {
        AlertDialog(
            onDismissRequest = { showResetPinDialog = false; resetPinValue = ""; resetPinError = ""; resetPinSuccess = false },
            title = { Text("Reset PIN") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (resetPinSuccess) {
                        Text("PIN reset successfully!", color = Color(0xFF2E7D32))
                    } else {
                        if (resetPinError.isNotEmpty()) {
                            Text(resetPinError, color = Color(0xFFD32F2F), fontSize = 13.sp)
                        }
                        Text("Enter a new 4-digit PIN for ${prisoner.fullName ?: prisoner.inmateId}", fontSize = 14.sp)
                        OutlinedTextField(
                            value = resetPinValue,
                            onValueChange = { if (it.length <= 4 && it.all { c -> c.isDigit() }) { resetPinValue = it; resetPinError = "" } },
                            label = { Text("New PIN") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                                keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword
                            )
                        )
                    }
                }
            },
            confirmButton = {
                if (!resetPinSuccess) {
                    TextButton(onClick = {
                        if (resetPinValue.length != 4) {
                            resetPinError = "PIN must be exactly 4 digits"
                        } else {
                            showResetPinDialog = false
                            resetPinValue = ""
                            resetPinError = ""
                            resetPinSuccess = false
                        }
                    }) { Text("Reset") }
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetPinDialog = false; resetPinValue = ""; resetPinError = ""; resetPinSuccess = false }) {
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
                    onValueChange = { fullName = it },
                    label = { Text("Full Name *") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                OutlinedTextField(
                    value = mobileNumber,
                    onValueChange = { mobileNumber = it },
                    label = { Text("Mobile Number") },
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
                    value = dateOfAdmission,
                    onValueChange = { dateOfAdmission = it },
                    label = { Text("Date of Admission (YYYY-MM-DD)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                OutlinedTextField(
                    value = cellId,
                    onValueChange = { cellId = it },
                    label = { Text("Cell ID") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                OutlinedTextField(
                    value = blockId,
                    onValueChange = { blockId = it },
                    label = { Text("Block ID") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

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

                OutlinedTextField(
                    value = sentenceDetails,
                    onValueChange = { sentenceDetails = it },
                    label = { Text("Sentence Details") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )

                OutlinedTextField(
                    value = sentenceStart,
                    onValueChange = { sentenceStart = it },
                    label = { Text("Sentence Start (YYYY-MM-DD)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                OutlinedTextField(
                    value = sentenceEnd,
                    onValueChange = { sentenceEnd = it },
                    label = { Text("Sentence End (YYYY-MM-DD)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
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
                    onClick = { showResetPinDialog = true },
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
