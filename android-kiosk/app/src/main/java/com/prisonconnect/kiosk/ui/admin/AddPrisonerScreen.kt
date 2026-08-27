package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme
import kotlinx.coroutines.delay

enum class PrisonerRegistrationStep {
    PERSONAL_INFO,
    PRISON_INFO,
    BIOMETRIC_DATA,
    COMPLETE
}

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
        onRegister = { firstName, lastName, mobileNumber, dateOfBirth, gender, prisonerNumber, cellBlock, cellNumber, securityLevel, sentenceStart, sentenceEnd, sentenceDetails, pin, face, finger, rfid ->
            viewModel.registerPrisoner(
                firstName, lastName, mobileNumber, dateOfBirth, gender,
                prisonerNumber, cellBlock, cellNumber, securityLevel,
                sentenceStart, sentenceEnd, sentenceDetails, pin,
                face, finger, rfid
            )
        },
        registrationState = registrationState
    )
}

@Composable
fun AddPrisonerContent(
    windowWidthSizeClass: WindowWidthSizeClass,
    onBackClick: () -> Unit,
    onComplete: () -> Unit,
    onRegister: (String, String, String, String, String, String, String, String, String, String, String, String, String, String?, String?, String?) -> Unit,
    registrationState: AddPrisonerViewModel.RegistrationState = AddPrisonerViewModel.RegistrationState.Idle
) {
    var currentStep by remember { mutableStateOf(PrisonerRegistrationStep.PERSONAL_INFO) }
    var progress by remember { mutableStateOf(0.25f) }

    // Form state
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var mobileNumber by remember { mutableStateOf("") }
    var dateOfBirth by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("male") }
    var prisonerNumber by remember { mutableStateOf("") }
    var cellBlock by remember { mutableStateOf("") }
    var cellNumber by remember { mutableStateOf("") }
    var securityLevel by remember { mutableStateOf("medium") }
    var sentenceStart by remember { mutableStateOf("") }
    var sentenceEnd by remember { mutableStateOf("") }
    var sentenceDetails by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var confirmPin by remember { mutableStateOf("") }
    var faceTemplate by remember { mutableStateOf("") }
    var fingerprintTemplate by remember { mutableStateOf("") }
    var rfidTag by remember { mutableStateOf("") }

    // Navigate to COMPLETE on success
    LaunchedEffect(registrationState) {
        if (registrationState is AddPrisonerViewModel.RegistrationState.Success) {
            currentStep = PrisonerRegistrationStep.COMPLETE
            progress = 1.0f
        }
    }

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
            // Progress Indicator
            LinearProgressIndicator(
                progress = progress,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp),
                color = Color(0xFF003366),
                trackColor = Color(0xFFE2E8F0)
            )

            // Step Indicator
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                StepIndicator(
                    stepNumber = 1,
                    title = "Personal",
                    isActive = currentStep == PrisonerRegistrationStep.PERSONAL_INFO,
                    isCompleted = currentStep.ordinal > PrisonerRegistrationStep.PERSONAL_INFO.ordinal
                )
                StepIndicator(
                    stepNumber = 2,
                    title = "Prison",
                    isActive = currentStep == PrisonerRegistrationStep.PRISON_INFO,
                    isCompleted = currentStep.ordinal > PrisonerRegistrationStep.PRISON_INFO.ordinal
                )
                StepIndicator(
                    stepNumber = 3,
                    title = "Biometric",
                    isActive = currentStep == PrisonerRegistrationStep.BIOMETRIC_DATA,
                    isCompleted = currentStep.ordinal > PrisonerRegistrationStep.BIOMETRIC_DATA.ordinal
                )
            }

            // Content
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                when (currentStep) {
                    PrisonerRegistrationStep.PERSONAL_INFO -> {
                        PersonalInfoStep(
                            firstName = firstName,
                            lastName = lastName,
                            mobileNumber = mobileNumber,
                            dateOfBirth = dateOfBirth,
                            gender = gender,
                            onFirstNameChange = { firstName = it },
                            onLastNameChange = { lastName = it },
                            onMobileNumberChange = { mobileNumber = it },
                            onDateOfBirthChange = { dateOfBirth = it },
                            onGenderChange = { gender = it }
                        )
                    }
                    PrisonerRegistrationStep.PRISON_INFO -> {
                        PrisonInfoStep(
                            prisonerNumber = prisonerNumber,
                            cellBlock = cellBlock,
                            cellNumber = cellNumber,
                            securityLevel = securityLevel,
                            sentenceStart = sentenceStart,
                            sentenceEnd = sentenceEnd,
                            sentenceDetails = sentenceDetails,
                            onPrisonerNumberChange = { prisonerNumber = it },
                            onCellBlockChange = { cellBlock = it },
                            onCellNumberChange = { cellNumber = it },
                            onSecurityLevelChange = { securityLevel = it },
                            onSentenceStartChange = { sentenceStart = it },
                            onSentenceEndChange = { sentenceEnd = it },
                            onSentenceDetailsChange = { sentenceDetails = it }
                        )
                    }
                    PrisonerRegistrationStep.BIOMETRIC_DATA -> {
                        BiometricDataStep(
                            pin = pin,
                            confirmPin = confirmPin,
                            faceTemplate = faceTemplate,
                            fingerprintTemplate = fingerprintTemplate,
                            rfidTag = rfidTag,
                            onPinChange = { pin = it },
                            onConfirmPinChange = { confirmPin = it },
                            onFaceTemplateChange = { faceTemplate = it },
                            onFingerprintTemplateChange = { fingerprintTemplate = it },
                            onRfidTagChange = { rfidTag = it }
                        )
                    }
                    PrisonerRegistrationStep.COMPLETE -> {
                        CompleteStep()
                    }
                }

                // Show error message
                if (registrationState is AddPrisonerViewModel.RegistrationState.Error) {
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
                                text = (registrationState as AddPrisonerViewModel.RegistrationState.Error).message,
                                color = Color(0xFFD32F2F),
                                fontSize = 14.sp
                            )
                        }
                    }
                }

                // Navigation Buttons
                if (currentStep != PrisonerRegistrationStep.COMPLETE) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        if (currentStep != PrisonerRegistrationStep.PERSONAL_INFO) {
                            OutlinedButton(
                                onClick = {
                                    currentStep = PrisonerRegistrationStep.values()[currentStep.ordinal - 1]
                                    progress -= 0.25f
                                },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(56.dp),
                                shape = RoundedCornerShape(12.dp),
                                enabled = registrationState !is AddPrisonerViewModel.RegistrationState.Loading
                            ) {
                                Icon(Icons.Default.ArrowBack, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Back")
                            }
                        }

                        Button(
                            onClick = {
                                if (currentStep == PrisonerRegistrationStep.BIOMETRIC_DATA) {
                                    // Validate PIN match before submitting
                                    if (pin != confirmPin) return@Button
                                    onRegister(
                                        firstName, lastName, mobileNumber, dateOfBirth, gender,
                                        prisonerNumber, cellBlock, cellNumber, securityLevel,
                                        sentenceStart, sentenceEnd, sentenceDetails, pin,
                                        faceTemplate, fingerprintTemplate, rfidTag
                                    )
                                } else {
                                    currentStep = PrisonerRegistrationStep.values()[currentStep.ordinal + 1]
                                    progress += 0.25f
                                }
                            },
                            modifier = Modifier
                                .weight(1f)
                                .height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF003366)),
                            enabled = registrationState !is AddPrisonerViewModel.RegistrationState.Loading
                        ) {
                            if (registrationState is AddPrisonerViewModel.RegistrationState.Loading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Text(
                                    text = if (currentStep == PrisonerRegistrationStep.BIOMETRIC_DATA) "Complete" else "Next",
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                if (currentStep != PrisonerRegistrationStep.BIOMETRIC_DATA) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Icon(Icons.Default.ArrowForward, contentDescription = null)
                                }
                            }
                        }
                    }
                } else {
                    Button(
                        onClick = onComplete,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50))
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Go to Dashboard", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun StepIndicator(
    stepNumber: Int,
    title: String,
    isActive: Boolean,
    isCompleted: Boolean
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.width(80.dp)
    ) {
        Surface(
            shape = CircleShape,
            color = when {
                isCompleted -> Color(0xFF4CAF50)
                isActive -> Color(0xFF003366)
                else -> Color(0xFFE2E8F0)
            },
            modifier = Modifier.size(40.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                if (isCompleted) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )
                } else {
                    Text(
                        text = stepNumber.toString(),
                        color = if (isActive) Color.White else Color(0xFF687A8F),
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = title,
            fontSize = 12.sp,
            fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal,
            color = if (isActive || isCompleted) Color(0xFF003366) else Color(0xFF687A8F),
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun PersonalInfoStep(
    firstName: String,
    lastName: String,
    mobileNumber: String,
    dateOfBirth: String,
    gender: String,
    onFirstNameChange: (String) -> Unit,
    onLastNameChange: (String) -> Unit,
    onMobileNumberChange: (String) -> Unit,
    onDateOfBirthChange: (String) -> Unit,
    onGenderChange: (String) -> Unit
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
                text = "Personal Information",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0B2240)
            )

            OutlinedTextField(
                value = firstName,
                onValueChange = onFirstNameChange,
                label = { Text("First Name *") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) }
            )

            OutlinedTextField(
                value = lastName,
                onValueChange = onLastNameChange,
                label = { Text("Last Name *") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) }
            )

            OutlinedTextField(
                value = mobileNumber,
                onValueChange = onMobileNumberChange,
                label = { Text("Mobile Number") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone
                )
            )

            OutlinedTextField(
                value = dateOfBirth,
                onValueChange = onDateOfBirthChange,
                label = { Text("Date of Birth (YYYY-MM-DD) *") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.CalendarToday, contentDescription = null) }
            )

            Text(
                text = "Gender *",
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0xFF0B2240)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                GenderOption(
                    label = "Male",
                    selected = gender == "male",
                    onClick = { onGenderChange("male") },
                    modifier = Modifier.weight(1f)
                )
                GenderOption(
                    label = "Female",
                    selected = gender == "female",
                    onClick = { onGenderChange("female") },
                    modifier = Modifier.weight(1f)
                )
                GenderOption(
                    label = "Other",
                    selected = gender == "other",
                    onClick = { onGenderChange("other") },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun GenderOption(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) Color(0xFF003366) else Color.White,
        border = BorderStroke(1.dp, if (selected) Color(0xFF003366) else Color(0xFFE2E8F0))
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

@Composable
private fun PrisonInfoStep(
    prisonerNumber: String,
    cellBlock: String,
    cellNumber: String,
    securityLevel: String,
    sentenceStart: String,
    sentenceEnd: String,
    sentenceDetails: String,
    onPrisonerNumberChange: (String) -> Unit,
    onCellBlockChange: (String) -> Unit,
    onCellNumberChange: (String) -> Unit,
    onSecurityLevelChange: (String) -> Unit,
    onSentenceStartChange: (String) -> Unit,
    onSentenceEndChange: (String) -> Unit,
    onSentenceDetailsChange: (String) -> Unit
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
                text = "Prison Information",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0B2240)
            )

            OutlinedTextField(
                value = prisonerNumber,
                onValueChange = onPrisonerNumberChange,
                label = { Text("Prisoner Number *") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = cellBlock,
                    onValueChange = onCellBlockChange,
                    label = { Text("Cell Block *") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                OutlinedTextField(
                    value = cellNumber,
                    onValueChange = onCellNumberChange,
                    label = { Text("Cell Number *") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }

            Text(
                text = "Security Level *",
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0xFF0B2240)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SecurityLevelOption(
                    label = "Low",
                    selected = securityLevel == "low",
                    onClick = { onSecurityLevelChange("low") },
                    modifier = Modifier.weight(1f),
                    color = Color(0xFF4CAF50)
                )
                SecurityLevelOption(
                    label = "Medium",
                    selected = securityLevel == "medium",
                    onClick = { onSecurityLevelChange("medium") },
                    modifier = Modifier.weight(1f),
                    color = Color(0xFFFF9800)
                )
                SecurityLevelOption(
                    label = "High",
                    selected = securityLevel == "high",
                    onClick = { onSecurityLevelChange("high") },
                    modifier = Modifier.weight(1f),
                    color = Color(0xFFF44336)
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = sentenceStart,
                    onValueChange = onSentenceStartChange,
                    label = { Text("Sentence Start *") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                OutlinedTextField(
                    value = sentenceEnd,
                    onValueChange = onSentenceEndChange,
                    label = { Text("Sentence End *") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }

            OutlinedTextField(
                value = sentenceDetails,
                onValueChange = onSentenceDetailsChange,
                label = { Text("Sentence Details *") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 5
            )
        }
    }
}

@Composable
fun SecurityLevelOption(
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

@Composable
private fun BiometricDataStep(
    pin: String,
    confirmPin: String,
    faceTemplate: String,
    fingerprintTemplate: String,
    rfidTag: String,
    onPinChange: (String) -> Unit,
    onConfirmPinChange: (String) -> Unit,
    onFaceTemplateChange: (String) -> Unit,
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
                text = "Set up a 4-digit PIN for the prisoner. This PIN will be required for authentication.",
                fontSize = 14.sp,
                color = Color(0xFF687A8F)
            )

            OutlinedTextField(
                value = pin,
                onValueChange = {
                    if (it.length <= 4 && it.all { char -> char.isDigit() }) {
                        onPinChange(it)
                    }
                },
                label = { Text("4-Digit PIN *") },
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
                    if (it.length <= 4 && it.all { char -> char.isDigit() }) {
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
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Biometric Data (Optional)",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0B2240)
            )

            OutlinedTextField(
                value = faceTemplate,
                onValueChange = onFaceTemplateChange,
                label = { Text("Face Template / ID") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Face, contentDescription = null) }
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
                            text = "Face, Fingerprint, and RFID data can be entered if available. These are not required.",
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
private fun CompleteStep() {
    Card(
        modifier = Modifier.fillMaxWidth(),
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
                text = "The prisoner has been successfully registered. Biometric data (fingerprint, face, RFID) will be collected next.",
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
            onRegister = { _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _ -> },
            registrationState = AddPrisonerViewModel.RegistrationState.Idle
        )
    }
}

/*
@Preview(name = "Tablet View", device = "spec:width=800dp,height=1280dp,orientation=portrait", showBackground = true)
@Composable
fun PreviewAddPrisonerTablet() {
    PrisonKioskTheme {
        AddPrisonerContent(
            windowWidthSizeClass = WindowWidthSizeClass.Medium,
            onBackClick = {},
            onComplete = {}
        )
    }
}
*/
