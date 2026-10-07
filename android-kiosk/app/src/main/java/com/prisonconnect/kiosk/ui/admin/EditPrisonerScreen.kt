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
import com.prisonconnect.kiosk.models.admin.EditPrisonerRequest
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
    val formState = remember(prisoner.inmateId) { PrisonerFormState(prisoner) }
    var status by remember(prisoner.inmateId) { mutableStateOf(prisoner.status) }
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
        val values = formState.toValues()
        val ageNum = values.age?.toIntOrNull()
        saveError = when {
            values.name.isEmpty() -> "Full name is required"
            values.age != null && ageNum == null -> "Age must be a number"
            ageNum != null && (ageNum < 1 || ageNum > 120) -> "Age must be between 1 and 120"
            else -> {
                onUpdate(
                    EditPrisonerRequest(
                        name = values.name,
                        prisonerNumber = values.prisonerNumber.ifBlank { null },
                        gender = values.gender,
                        age = ageNum,
                        dateOfAdmission = values.dateOfAdmission,
                        fatherName = values.fatherName,
                        motherName = values.motherName,
                        idProof = values.idProof,
                        idNumber = values.idNumber,
                        religion = values.religion,
                        nationality = values.nationality,
                        state = values.state,
                        district = values.district,
                        address = values.address,
                        assignedKioskId = formState.assignedKioskId.trim().ifBlank { null },
                        status = status,
                        active = formState.active
                    )
                )
                ""
            }
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

        PrisonerDetailsFields(formState)

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(2.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Status & Access", fontSize = 18.sp, fontWeight = FontWeight.Bold)

                OutlinedTextField(
                    value = formState.assignedKioskId,
                    onValueChange = { formState.assignedKioskId = it; saveError = "" },
                    label = { Text("Assigned Kiosk ID") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = formState.active, onCheckedChange = { formState.active = it })
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(if (formState.active) "Active" else "Suspended")
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
