package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.hardware.FingerprintCaptureState
import com.prisonconnect.kiosk.hardware.RfidReaderState
import com.prisonconnect.kiosk.models.admin.BiometricRegistration
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.ui.auth.RfidKeypadEntry
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.*

/** Live hardware status shown inside the capture dialog. */
private sealed interface BiometricCaptureStatus {
    data object Waiting : BiometricCaptureStatus
    data object Detected : BiometricCaptureStatus
    data class Error(val message: String) : BiometricCaptureStatus
}

@Composable
fun BiometricRegistrationScreen(
    prisonerId: String,
    prisonerName: String,
    onBackClick: () -> Unit,
    viewModel: BiometricRegistrationViewModel = hiltViewModel()
) {
    val biometricsResult by viewModel.biometrics.collectAsState()
    val registerResult by viewModel.registerState.collectAsState()
    val deleteResult by viewModel.deleteState.collectAsState()
    val fingerprintState by viewModel.fingerprintState.collectAsState()
    val rfidState by viewModel.rfidState.collectAsState()
    var showFingerprintDialog by remember { mutableStateOf(false) }
    var showRfidDialog by remember { mutableStateOf(false) }
    var snackbarMessage by remember { mutableStateOf<String?>(null) }

    val registerError = (registerResult as? NetworkResult.Failure)?.error?.message

    // Hardware read → auto-register (dialog must be open for that type).
    LaunchedEffect(fingerprintState, showFingerprintDialog) {
        val state = fingerprintState
        if (showFingerprintDialog && state is FingerprintCaptureState.Captured) {
            viewModel.acknowledgeCapture("fingerprint")
            viewModel.registerFingerprint(prisonerId, state.template)
        }
    }
    LaunchedEffect(rfidState, showRfidDialog) {
        val state = rfidState
        if (showRfidDialog && state is RfidReaderState.CardRead) {
            viewModel.acknowledgeCapture("rfid")
            viewModel.registerRfid(prisonerId, state.token)
        }
    }

    // Screen left — make sure no hardware session keeps running.
    DisposableEffect(Unit) {
        onDispose { viewModel.stopCapture() }
    }

    LaunchedEffect(snackbarMessage) {
        if (snackbarMessage != null) {
            kotlinx.coroutines.delay(3000L)
            snackbarMessage = null
        }
    }

    LaunchedEffect(prisonerId) {
        viewModel.loadBiometrics(prisonerId)
    }

    LaunchedEffect(registerResult) {
        when (registerResult) {
            is NetworkResult.Success -> {
                snackbarMessage = "Biometric registered"
                showFingerprintDialog = false
                showRfidDialog = false
                viewModel.stopCapture()
                viewModel.resetRegisterState()
            }
            is NetworkResult.Failure -> { snackbarMessage = "Failed to register"; viewModel.resetRegisterState() }
            else -> {}
        }
    }
    LaunchedEffect(deleteResult) {
        when (deleteResult) {
            is NetworkResult.Success -> { snackbarMessage = "Biometric removed"; viewModel.resetDeleteState() }
            is NetworkResult.Failure -> { snackbarMessage = "Failed to remove"; viewModel.resetDeleteState() }
            else -> {}
        }
    }

    Scaffold(
        topBar = {
            KioskTopBar(title = "Biometrics", showBackButton = true, onBackClick = onBackClick)
        },
        snackbarHost = { snackbarMessage?.let { Snackbar { Text(it) } } },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Header
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(2.dp)
            ) {
                Row(
                    modifier = Modifier.padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(shape = CircleShape, color = Color(0xFF003366).copy(alpha = 0.1f), modifier = Modifier.size(48.dp)) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Fingerprint, contentDescription = null, tint = Color(0xFF003366))
                        }
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(prisonerName, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text(prisonerId, fontSize = 14.sp, color = Color(0xFF687A8F))
                    }
                }
            }

            // Fingerprint Registration
            BiometricCard(
                title = "Fingerprint",
                icon = Icons.Default.Fingerprint,
                isRegistered = biometricsResult is NetworkResult.Success &&
                        (biometricsResult as NetworkResult.Success).data.any { it.type == "fingerprint" && it.status == "registered" },
                hint = "Place the finger on the scanner to register",
                onRegister = {
                    showFingerprintDialog = true
                    viewModel.startCapture("fingerprint")
                },
                onDelete = {
                    val bio = (biometricsResult as? NetworkResult.Success)?.data?.find { it.type == "fingerprint" }
                    if (bio != null) viewModel.deleteBiometric(bio.biometricId, prisonerId)
                }
            )

            // RFID Registration
            BiometricCard(
                title = "RFID Card",
                icon = Icons.Default.CreditCard,
                isRegistered = biometricsResult is NetworkResult.Success &&
                        (biometricsResult as NetworkResult.Success).data.any { it.type == "rfid" && it.status == "registered" },
                hint = "Tap card on reader or enter number",
                onRegister = {
                    showRfidDialog = true
                    viewModel.startCapture("rfid")
                },
                onDelete = {
                    val bio = (biometricsResult as? NetworkResult.Success)?.data?.find { it.type == "rfid" }
                    if (bio != null) viewModel.deleteBiometric(bio.biometricId, prisonerId)
                }
            )

            // Registration history
            if (biometricsResult is NetworkResult.Success) {
                val bios = (biometricsResult as NetworkResult.Success).data
                if (bios.isNotEmpty()) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(2.dp)
                    ) {
                        Column(modifier = Modifier.padding(20.dp)) {
                            Text("Registration History", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Spacer(modifier = Modifier.height(12.dp))
                            bios.forEach { bio ->
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        when (bio.type) {
                                            "fingerprint" -> Icons.Default.Fingerprint
                                            else -> Icons.Default.CreditCard
                                        },
                                        contentDescription = null,
                                        tint = Color(0xFF003366),
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text((bio.type ?: "unknown").uppercase(), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                        Text(formatDate(bio.registeredAt), fontSize = 11.sp, color = Color(0xFF999999))
                                    }
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = if (bio.status == "registered") Color(0xFFE8F5E9) else Color(0xFFFFEBEE)
                                    ) {
                                        Text(
                                            (bio.status ?: "unknown").uppercase(),
                                            fontSize = 10.sp,
                                            color = if (bio.status == "registered") Color(0xFF2E7D32) else Color(0xFFD32F2F),
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (biometricsResult is NetworkResult.Loading) {
                KioskLoadingState(modifier = Modifier.align(Alignment.CenterHorizontally))
            }
        }
    }

    // Dialogs — hardware capture with a small instruction card.
    // Fingerprints register from the scanner only (no number to type);
    // RFID keeps manual card-number entry as a fallback.
    if (showFingerprintDialog) {
        BiometricCaptureDialog(
            title = "Fingerprint",
            icon = Icons.Default.Fingerprint,
            instruction = "Place the finger on the USB fingerprint scanner",
            hint = "Connect the scanner to the kiosk, then hold the finger still until it is detected.",
            showManualEntry = false,
            status = when (val s = fingerprintState) {
                is FingerprintCaptureState.Captured -> BiometricCaptureStatus.Detected
                is FingerprintCaptureState.Failed -> BiometricCaptureStatus.Error(s.message)
                else -> BiometricCaptureStatus.Waiting
            },
            registerError = registerError,
            onManualConfirm = { viewModel.registerFingerprint(prisonerId, it) },
            onDismiss = {
                showFingerprintDialog = false
                viewModel.stopCapture()
            }
        )
    }
    if (showRfidDialog) {
        BiometricCaptureDialog(
            title = "RFID Card",
            icon = Icons.Default.CreditCard,
            instruction = "Tap the RFID card on the reader",
            hint = "Hold the card on the reader until its number is detected.",
            showManualEntry = true,
            status = when (val s = rfidState) {
                is RfidReaderState.CardRead -> BiometricCaptureStatus.Detected
                is RfidReaderState.Failed -> BiometricCaptureStatus.Error(s.message)
                else -> BiometricCaptureStatus.Waiting
            },
            registerError = registerError,
            onManualConfirm = { viewModel.registerRfid(prisonerId, it) },
            onDismiss = {
                showRfidDialog = false
                viewModel.stopCapture()
            }
        )
    }
}

@Composable
fun BiometricCard(
    title: String,
    icon: ImageVector,
    isRegistered: Boolean,
    hint: String? = null,
    onRegister: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(shape = CircleShape, color = if (isRegistered) Color(0xFFE8F5E9) else Color(0xFFF5F5F5), modifier = Modifier.size(44.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, contentDescription = null, tint = if (isRegistered) Color(0xFF2E7D32) else Color(0xFF999999))
                }
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text(
                    if (isRegistered) "Registered" else "Not registered",
                    fontSize = 12.sp,
                    color = if (isRegistered) Color(0xFF2E7D32) else Color(0xFF999999)
                )
                if (!isRegistered && hint != null) {
                    Text(hint, fontSize = 11.sp, color = Color(0xFF687A8F))
                }
            }
            if (isRegistered) {
                TextButton(onClick = onDelete) {
                    Text("Remove", color = Color(0xFFD32F2F), fontSize = 13.sp)
                }
            } else {
                Button(onClick = onRegister) {
                    Text("Register", fontSize = 13.sp)
                }
            }
        }
    }
}

/**
 * Small capture dialog: instruction card with live hardware status on top.
 * [showManualEntry] adds the manual number fallback (RFID only): a link to an
 * on-screen 12-dot keypad that auto-registers when the number is complete.
 */
@Composable
private fun BiometricCaptureDialog(
    title: String,
    icon: ImageVector,
    instruction: String,
    hint: String,
    showManualEntry: Boolean,
    status: BiometricCaptureStatus,
    registerError: String?,
    onManualConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var showKeypad by remember { mutableStateOf(false) }
    var digits by remember { mutableStateOf("") }

    // A failed attempt clears the number so the next try starts clean.
    LaunchedEffect(registerError) {
        if (registerError != null) digits = ""
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(icon, contentDescription = null, tint = Color(0xFF003366), modifier = Modifier.size(32.dp)) },
        title = { Text("Register $title") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Instruction card — what to do + live reader status.
                Surface(
                    color = Color(0xFFF5F7FA),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        when (status) {
                            BiometricCaptureStatus.Waiting -> {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = Color(0xFF003366)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(instruction, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF0B2240))
                                    Text("Waiting for capture…", fontSize = 12.sp, color = Color(0xFF687A8F))
                                }
                            }
                            BiometricCaptureStatus.Detected -> {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(12.dp))
                                Text("Detected — registering…", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF0B2240))
                            }
                            is BiometricCaptureStatus.Error -> {
                                Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFD32F2F), modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(instruction, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF0B2240))
                                    Text(status.message, fontSize = 12.sp, color = Color(0xFFD32F2F))
                                }
                            }
                        }
                    }
                }

                if (showManualEntry && showKeypad) {
                    RfidKeypadEntry(
                        digits = digits,
                        onDigitsChange = { new ->
                            digits = new
                            if (new.length == 12) onManualConfirm(new)
                        }
                    )
                } else {
                    Text(hint, fontSize = 12.sp, color = Color(0xFF687A8F))
                    if (showManualEntry) {
                        TextButton(onClick = { showKeypad = true }) {
                            Text(
                                "Enter card number instead",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF003366)
                            )
                        }
                    }
                }

                if (registerError != null) {
                    Text(
                        registerError,
                        fontSize = 12.sp,
                        color = Color(0xFFD32F2F),
                        textAlign = TextAlign.Center
                    )
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(if (showManualEntry) "Cancel" else "Close") } },
        confirmButton = {}
    )
}

private fun formatDate(iso: String?): String {
    if (iso == null) return "Unknown"
    return try {
        val sdf = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())
        sdf.format(Date.from(java.time.Instant.parse(iso)))
    } catch (_: Exception) { iso }
}
