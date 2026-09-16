package com.prisonconnect.kiosk.ui.admin

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.models.admin.BiometricRegistration
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.*

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
    var showFaceDialog by remember { mutableStateOf(false) }
    var showFingerprintDialog by remember { mutableStateOf(false) }
    var showRfidDialog by remember { mutableStateOf(false) }
    var snackbarMessage by remember { mutableStateOf<String?>(null) }

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
            is NetworkResult.Success -> { snackbarMessage = "Biometric registered"; viewModel.resetRegisterState() }
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

            // Face Registration
            BiometricCard(
                title = "Face Recognition",
                icon = Icons.Default.Face,
                isRegistered = biometricsResult is NetworkResult.Success &&
                        (biometricsResult as NetworkResult.Success).data.any { it.type == "face" && it.status == "registered" },
                onRegister = { showFaceDialog = true },
                onDelete = {
                    val bio = (biometricsResult as? NetworkResult.Success)?.data?.find { it.type == "face" }
                    if (bio != null) viewModel.deleteBiometric(bio.biometricId, prisonerId)
                }
            )

            // Fingerprint Registration
            BiometricCard(
                title = "Fingerprint",
                icon = Icons.Default.Fingerprint,
                isRegistered = biometricsResult is NetworkResult.Success &&
                        (biometricsResult as NetworkResult.Success).data.any { it.type == "fingerprint" && it.status == "registered" },
                onRegister = { showFingerprintDialog = true },
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
                onRegister = { showRfidDialog = true },
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
                                            "face" -> Icons.Default.Face
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

    // Dialogs
    if (showFaceDialog) {
        FaceRegistrationDialog(
            onDismiss = { showFaceDialog = false },
            onCapture = { base64 ->
                viewModel.registerFace(prisonerId, base64)
                showFaceDialog = false
            }
        )
    }
    if (showFingerprintDialog) {
        ManualBiometricDialog(
            title = "Fingerprint",
            placeholder = "Fingerprint template ID",
            onDismiss = { showFingerprintDialog = false },
            onConfirm = { template ->
                viewModel.registerFingerprint(prisonerId, template)
                showFingerprintDialog = false
            }
        )
    }
    if (showRfidDialog) {
        ManualBiometricDialog(
            title = "RFID",
            placeholder = "RFID token / card number",
            onDismiss = { showRfidDialog = false },
            onConfirm = { token ->
                viewModel.registerRfid(prisonerId, token)
                showRfidDialog = false
            }
        )
    }
}

@Composable
fun BiometricCard(
    title: String,
    icon: ImageVector,
    isRegistered: Boolean,
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

@Composable
fun FaceRegistrationDialog(
    onDismiss: () -> Unit,
    onCapture: (String) -> Unit
) {
    var imageBase64 by remember { mutableStateOf("") }
    var previewBitmap by remember { mutableStateOf<Bitmap?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Register Face") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "Paste a base64-encoded face image or enter the face template ID.",
                    fontSize = 14.sp,
                    color = Color(0xFF687A8F)
                )
                OutlinedTextField(
                    value = imageBase64,
                    onValueChange = {
                        imageBase64 = it
                        try {
                            val bytes = Base64.decode(it, Base64.DEFAULT)
                            previewBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        } catch (_: Exception) { previewBitmap = null }
                    },
                    label = { Text("Face image (base64) or template ID") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )
                if (previewBitmap != null) {
                    Text("Image preview available", fontSize = 12.sp, color = Color(0xFF2E7D32))
                }
            }
        },
        confirmButton = {
            Button(onClick = { if (imageBase64.isNotBlank()) onCapture(imageBase64.trim()) }) {
                Text("Register")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun ManualBiometricDialog(
    title: String,
    placeholder: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var value by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Register $title") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Enter the $title template or token ID.", fontSize = 14.sp, color = Color(0xFF687A8F))
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = { Text(placeholder) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
        },
        confirmButton = {
            Button(onClick = { if (value.isNotBlank()) onConfirm(value.trim()) }) { Text("Register") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

private fun formatDate(iso: String?): String {
    if (iso == null) return "Unknown"
    return try {
        val sdf = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())
        sdf.format(Date.from(java.time.Instant.parse(iso)))
    } catch (_: Exception) { iso }
}
