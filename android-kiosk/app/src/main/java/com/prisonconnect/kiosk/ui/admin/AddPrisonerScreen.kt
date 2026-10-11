package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.hardware.FingerprintCaptureState
import com.prisonconnect.kiosk.hardware.RfidReaderState
import com.prisonconnect.kiosk.models.admin.PrisonerFormValues
import com.prisonconnect.kiosk.ui.auth.HiddenRfidTapInput
import com.prisonconnect.kiosk.ui.auth.RfidKeypadEntry
import com.prisonconnect.kiosk.ui.auth.RfidTapAnimation
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

private val ADD_STEP_TITLES = listOf("Personal", "Identity", "Address", "Security")

@Composable
fun AddPrisonerScreen(
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    onComplete: () -> Unit,
    viewModel: AddPrisonerViewModel = hiltViewModel()
) {
    val registrationState by viewModel.registrationState.collectAsState()
    val fingerprintState by viewModel.fingerprintState.collectAsState()
    val rfidState by viewModel.rfidState.collectAsState()

    // Screen left mid-capture — no hardware session may keep running.
    DisposableEffect(Unit) {
        onDispose { viewModel.stopCapture() }
    }

    AddPrisonerContent(
        windowWidthSizeClass = windowSizeClass.widthSizeClass,
        onBackClick = onBackClick,
        onComplete = onComplete,
        onRegister = { values, pin, finger, rfid ->
            viewModel.registerPrisoner(values, pin, finger, rfid)
        },
        registrationState = registrationState,
        fingerprintState = fingerprintState,
        rfidState = rfidState,
        onStartCapture = viewModel::startCapture,
        onStopCapture = viewModel::stopCapture,
        onAcknowledgeCapture = viewModel::acknowledgeCapture,
        onRfidCardTapped = viewModel::onRfidCardTapped
    )
}

@Composable
fun AddPrisonerContent(
    windowWidthSizeClass: WindowWidthSizeClass,
    onBackClick: () -> Unit,
    onComplete: () -> Unit,
    onRegister: (PrisonerFormValues, String, String?, String?) -> Unit,
    registrationState: AddPrisonerViewModel.RegistrationState = AddPrisonerViewModel.RegistrationState.Idle,
    fingerprintState: FingerprintCaptureState = FingerprintCaptureState.Idle,
    rfidState: RfidReaderState = RfidReaderState.Idle,
    onStartCapture: (String) -> Unit = {},
    onStopCapture: () -> Unit = {},
    onAcknowledgeCapture: (String) -> Unit = {},
    onRfidCardTapped: (String) -> Unit = {}
) {
    val formState = remember { PrisonerFormState(null) }
    var step by remember { mutableStateOf(0) }
    var pin by remember { mutableStateOf("") }
    var confirmPin by remember { mutableStateOf("") }
    var fingerprintTemplate by remember { mutableStateOf("") }
    var rfidTag by remember { mutableStateOf("") }
    var formError by remember { mutableStateOf("") }
    var showFingerprintDialog by remember { mutableStateOf(false) }
    var showRfidDialog by remember { mutableStateOf(false) }

    // Hardware read while its dialog is open → keep the capture locally.
    // The actual template/tag is sent with the prisoner at Register time.
    LaunchedEffect(fingerprintState, showFingerprintDialog) {
        val state = fingerprintState
        if (showFingerprintDialog && state is FingerprintCaptureState.Captured) {
            onAcknowledgeCapture("fingerprint")
            fingerprintTemplate = state.template
            showFingerprintDialog = false
            onStopCapture()
        }
    }
    LaunchedEffect(rfidState, showRfidDialog) {
        val state = rfidState
        if (showRfidDialog && state is RfidReaderState.CardRead) {
            onAcknowledgeCapture("rfid")
            rfidTag = state.token
            showRfidDialog = false
            onStopCapture()
        }
    }

    var completed by remember { mutableStateOf(false) }
    LaunchedEffect(registrationState) {
        if (registrationState is AddPrisonerViewModel.RegistrationState.Success) {
            completed = true
        }
    }

    val loading = registrationState is AddPrisonerViewModel.RegistrationState.Loading

    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Add New Prisoner",
                showBackButton = true,
                onBackClick = onBackClick
            )
        },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
        ) {
            if (completed) {
                CompleteStep(
                    modifier = Modifier
                        .padding(16.dp)
                        .verticalScroll(rememberScrollState())
                )

                Button(
                    onClick = onComplete,
                    modifier = Modifier
                        .padding(horizontal = 16.dp)
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50))
                ) {
                    Icon(Icons.Default.Check, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Go to Dashboard", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            } else {
                PrisonerStepHeader(titles = ADD_STEP_TITLES, currentStep = step)

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    when (step) {
                        0 -> PersonalDetailsCard(formState)
                        1 -> IdentityAdmissionCard(formState)
                        2 -> AddressCard(formState)
                        else -> BiometricDataStep(
                            pin = pin,
                            confirmPin = confirmPin,
                            fingerprintTemplate = fingerprintTemplate,
                            rfidTag = rfidTag,
                            onPinChange = { pin = it; formError = "" },
                            onConfirmPinChange = { confirmPin = it; formError = "" },
                            onRegisterFingerprint = {
                                showFingerprintDialog = true
                                onStartCapture("fingerprint")
                            },
                            onClearFingerprint = { fingerprintTemplate = "" },
                            onRegisterRfid = {
                                showRfidDialog = true
                                onStartCapture("rfid")
                            },
                            onClearRfid = { rfidTag = "" }
                        )
                    }

                    val effectiveError = when {
                        registrationState is AddPrisonerViewModel.RegistrationState.Error ->
                            (registrationState as AddPrisonerViewModel.RegistrationState.Error).message
                        formError.isNotEmpty() -> formError
                        else -> ""
                    }
                    if (effectiveError.isNotEmpty()) {
                        ErrorCard(effectiveError)
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        if (step > 0) {
                            OutlinedButton(
                                onClick = {
                                    if (!loading) {
                                        step -= 1
                                        formError = ""
                                    }
                                },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(56.dp),
                                shape = RoundedCornerShape(12.dp),
                                enabled = !loading
                            ) {
                                Icon(Icons.Default.ArrowBack, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Back")
                            }
                        }

                        Button(
                            onClick = {
                                if (step == ADD_STEP_TITLES.lastIndex) {
                                    val personalError = formState.validatePersonal()
                                    formError = when {
                                        personalError.isNotEmpty() -> personalError
                                        pin.length != 6 -> "PIN must be exactly 6 digits"
                                        pin != confirmPin -> "PINs do not match"
                                        else -> ""
                                    }
                                    if (formError.isEmpty()) {
                                        onRegister(
                                            formState.toValues(),
                                            pin,
                                            fingerprintTemplate.ifBlank { null },
                                            rfidTag.ifBlank { null }
                                        )
                                    }
                                } else {
                                    val personalError = formState.validatePersonal()
                                    if (step == 0 && personalError.isNotEmpty()) {
                                        formError = personalError
                                    } else {
                                        formError = ""
                                        step += 1
                                    }
                                }
                            },
                            modifier = Modifier
                                .weight(if (step > 0) 1f else 2f)
                                .height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF003366)),
                            enabled = !loading
                        ) {
                            if (loading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp
                                )
                            } else if (step == ADD_STEP_TITLES.lastIndex) {
                                Text(
                                    text = "Register Prisoner",
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            } else {
                                Text(
                                    text = "Next",
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Icon(Icons.Default.ArrowForward, contentDescription = null)
                            }
                        }
                    }
                }
            }
        }
    }

    // Capture dialogs — same hardware flow as the Biometrics screen.
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
            registerError = null,
            onManualConfirm = {},
            onDismiss = {
                showFingerprintDialog = false
                onStopCapture()
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
            registerError = null,
            onManualConfirm = {
                rfidTag = it
                showRfidDialog = false
                onStopCapture()
            },
            onCardTap = onRfidCardTapped,
            animation = { RfidTapAnimation(modifier = Modifier.size(130.dp)) },
            onDismiss = {
                showRfidDialog = false
                onStopCapture()
            }
        )
    }
}

@Composable
internal fun ErrorCard(message: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Error,
                contentDescription = null,
                tint = Color(0xFFD32F2F),
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = message,
                color = Color(0xFFD32F2F),
                fontSize = 14.sp
            )
        }
    }
}

@Composable
private fun BiometricDataStep(
    pin: String,
    confirmPin: String,
    fingerprintTemplate: String,
    rfidTag: String,
    onPinChange: (String) -> Unit,
    onConfirmPinChange: (String) -> Unit,
    onRegisterFingerprint: () -> Unit,
    onClearFingerprint: () -> Unit,
    onRegisterRfid: () -> Unit,
    onClearRfid: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Security Setup",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0B2240)
            )

            Text(
                text = "Set up a 6-digit PIN for the prisoner. This PIN will be required for authentication.",
                fontSize = 14.sp,
                color = Color(0xFF687A8F)
            )

            OutlinedTextField(
                value = pin,
                onValueChange = {
                    if (it.length <= 6 && it.all { char -> char.isDigit() }) {
                        onPinChange(it)
                    }
                },
                label = { Text("6-Digit PIN *") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword
                )
            )

            OutlinedTextField(
                value = confirmPin,
                onValueChange = {
                    if (it.length <= 6 && it.all { char -> char.isDigit() }) {
                        onConfirmPinChange(it)
                    }
                },
                label = { Text("Confirm PIN *") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword
                ),
                isError = pin.isNotEmpty() && confirmPin.isNotEmpty() && pin != confirmPin
            )

            if (pin.isNotEmpty() && confirmPin.isNotEmpty() && pin != confirmPin) {
                Text(
                    text = "PINs do not match",
                    color = Color(0xFFD32F2F),
                    fontSize = 12.sp,
                    modifier = Modifier.padding(start = 16.dp)
                )
            } else if (pin.isNotEmpty() && pin.length != 6) {
                Text(
                    text = "PIN must be exactly 6 digits",
                    color = Color(0xFFD32F2F),
                    fontSize = 12.sp,
                    modifier = Modifier.padding(start = 16.dp)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Biometric Data (Optional)",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0B2240)
            )

            BiometricCard(
                title = "Fingerprint",
                icon = Icons.Default.Fingerprint,
                isRegistered = fingerprintTemplate.isNotBlank(),
                hint = "Place the finger on the scanner — no typing needed",
                onRegister = onRegisterFingerprint,
                onDelete = onClearFingerprint
            )

            BiometricCard(
                title = "RFID Card",
                icon = Icons.Default.CreditCard,
                isRegistered = rfidTag.isNotBlank(),
                hint = "Tap the card on the reader",
                onRegister = onRegisterRfid,
                onDelete = onClearRfid
            )

            Spacer(modifier = Modifier.height(8.dp))

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFFE3F2FD)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = null,
                        tint = Color(0xFF003366),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "Biometric Registration",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = Color(0xFF003366)
                        )
                        Text(
                            text = "Capture the fingerprint or tap the RFID card — both are optional. Data can also be added later from the Biometrics screen.",
                            fontSize = 12.sp,
                            color = Color(0xFF003366)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CompleteStep(modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Surface(
                shape = CircleShape,
                color = Color(0xFF4CAF50).copy(alpha = 0.1f),
                modifier = Modifier.size(80.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(48.dp)
                    )
                }
            }

            Text(
                text = "Registration Complete!",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0B2240),
                textAlign = TextAlign.Center
            )

            Text(
                text = "The prisoner has been successfully registered.",
                fontSize = 14.sp,
                color = Color(0xFF687A8F),
                textAlign = TextAlign.Center
            )
        }
    }
}

// --- PREVIEWS ---

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewAddPrisonerMobile() {
    PrisonKioskTheme {
        AddPrisonerContent(
            windowWidthSizeClass = WindowWidthSizeClass.Compact,
            onBackClick = {},
            onComplete = {},
            onRegister = { _, _, _, _ -> },
            registrationState = AddPrisonerViewModel.RegistrationState.Idle
        )
    }
}
