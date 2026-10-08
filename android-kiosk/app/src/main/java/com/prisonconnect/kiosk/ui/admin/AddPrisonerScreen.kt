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
import com.prisonconnect.kiosk.models.admin.PrisonerFormValues
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

    AddPrisonerContent(
        windowWidthSizeClass = windowSizeClass.widthSizeClass,
        onBackClick = onBackClick,
        onComplete = onComplete,
        onRegister = { values, pin, finger, rfid ->
            viewModel.registerPrisoner(values, pin, finger, rfid)
        },
        registrationState = registrationState
    )
}

@Composable
fun AddPrisonerContent(
    windowWidthSizeClass: WindowWidthSizeClass,
    onBackClick: () -> Unit,
    onComplete: () -> Unit,
    onRegister: (PrisonerFormValues, String, String?, String?) -> Unit,
    registrationState: AddPrisonerViewModel.RegistrationState = AddPrisonerViewModel.RegistrationState.Idle
) {
    val formState = remember { PrisonerFormState(null) }
    var step by remember { mutableStateOf(0) }
    var pin by remember { mutableStateOf("") }
    var confirmPin by remember { mutableStateOf("") }
    var fingerprintTemplate by remember { mutableStateOf("") }
    var rfidTag by remember { mutableStateOf("") }
    var formError by remember { mutableStateOf("") }

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
                            onFingerprintTemplateChange = { fingerprintTemplate = it },
                            onRfidTagChange = { rfidTag = it }
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
    onFingerprintTemplateChange: (String) -> Unit,
    onRfidTagChange: (String) -> Unit
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

            OutlinedTextField(
                value = fingerprintTemplate,
                onValueChange = onFingerprintTemplateChange,
                label = { Text("Fingerprint Template") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Fingerprint, contentDescription = null) }
            )

            OutlinedTextField(
                value = rfidTag,
                onValueChange = onRfidTagChange,
                label = { Text("RFID Tag / ID") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.CreditCard, contentDescription = null) }
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
                            text = "Fingerprint and RFID data can be entered if available. These are not required.",
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
