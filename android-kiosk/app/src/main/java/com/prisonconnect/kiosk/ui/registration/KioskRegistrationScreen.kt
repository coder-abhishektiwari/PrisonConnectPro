package com.prisonconnect.kiosk.ui.registration

import android.util.Log
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KioskRegistrationScreen(
    viewModel: KioskRegistrationViewModel,
    onRegistrationApproved: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.isApproved) {
        if (uiState.isApproved) {
            onRegistrationApproved()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF0F172A),
                        Color(0xFF1E293B),
                        Color(0xFF0F172A)
                    )
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header / Logo Section (Responsive Row / Column)
            HeaderSection(currentStep = uiState.currentStep)

            Spacer(modifier = Modifier.height(16.dp))

            // Error Banner
            // Error Banner Block
            uiState.errorMessage?.takeIf { it.isNotBlank() }?.let { errorMsg ->
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFEF4444).copy(alpha = 0.15f),
                    border = BorderStroke(1.dp, Color(0xFFEF4444).copy(alpha = 0.4f))
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            tint = Color(0xFFFCA5A5),
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = errorMsg,
                            color = Color(0xFFFCA5A5),
                            fontSize = 14.sp,
                            modifier = Modifier.weight(1f)
                        )
                        Log.d("my error", "Error message: $errorMsg")
                    }
                }
            }

            // Main Dynamic Form Card (Scrollable Body)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Color(0xFF1E293B).copy(alpha = 0.85f)
                ),
                border = BorderStroke(1.dp, Color(0xFF334155))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(20.dp),
                    contentAlignment = Alignment.Center
                ) {
                    val scrollState = rememberScrollState()

                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(scrollState),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        when (uiState.currentStep) {
                            RegistrationStep.SELECT_JAIL -> StepSelectJail(
                                prisonId = uiState.prisonIdInput,
                                isLoading = uiState.isLoading,
                                onPrisonIdChange = { viewModel.onPrisonIdChange(it) },
                                onNext = { viewModel.goToPinStep() }
                            )

                            RegistrationStep.ENTER_PIN -> StepEnterPin(
                                prisonId = uiState.prisonIdInput,
                                pin = uiState.setupPin,
                                isLoading = uiState.isLoading,
                                onPinChange = { viewModel.onPinChange(it) },
                                onBack = { viewModel.backToPreviousStep() },
                                onNext = { viewModel.validatePinAndProceed() }
                            )

                            RegistrationStep.SUBMIT_DEVICE_INFO -> StepSubmitDeviceInfo(
                                uiState = uiState,
                                onLocationChange = { viewModel.onLocationChange(it) },
                                onBack = { viewModel.backToPreviousStep() },
                                onSubmit = { viewModel.submitRegistration() }
                            )

                            RegistrationStep.PENDING_APPROVAL -> StepPendingApproval(
                                uiState = uiState,
                                onCheckStatus = { viewModel.checkStatusManually() },
                                onReRegister = { viewModel.reRegister() },
                                onChangeData = { viewModel.goToEditData() }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HeaderSection(currentStep: RegistrationStep) {
    val configuration = LocalConfiguration.current
    val isCompactScreen = configuration.screenWidthDp < 600

    if (isCompactScreen) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            HeaderLogo()
            StepIndicators(currentStep = currentStep)
        }
    } else {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            HeaderLogo()
            StepIndicators(currentStep = currentStep)
        }
    }
}

@Composable
private fun HeaderLogo() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(
            modifier = Modifier.size(44.dp),
            shape = RoundedCornerShape(12.dp),
            color = Color(0xFF2563EB).copy(alpha = 0.2f),
            border = BorderStroke(1.dp, Color(0xFF3B82F6))
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.Security,
                    contentDescription = null,
                    tint = Color(0xFF60A5FA),
                    modifier = Modifier.size(24.dp)
                )
            }
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(
                text = "PRISONCONNECT KIOSK",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                letterSpacing = 1.sp
            )
            Text(
                text = "Kiosk Provisioning",
                fontSize = 12.sp,
                color = Color(0xFF94A3B8)
            )
        }
    }
}

@Composable
private fun StepIndicators(currentStep: RegistrationStep) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RegistrationStep.values().forEachIndexed { index, step ->
            val isCurrent = currentStep == step
            val isPassed = currentStep.ordinal > step.ordinal

            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(
                        when {
                            isCurrent -> Color(0xFF3B82F6)
                            isPassed -> Color(0xFF10B981)
                            else -> Color(0xFF334155)
                        }
                    ),
                contentAlignment = Alignment.Center
            ) {
                if (isPassed) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(14.dp)
                    )
                } else {
                    Text(
                        text = "${index + 1}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StepSelectJail(
    prisonId: String?,
    isLoading: Boolean,
    onPrisonIdChange: (String) -> Unit,
    onNext: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 500.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.AccountBalance,
            contentDescription = null,
            tint = Color(0xFF60A5FA),
            modifier = Modifier.size(48.dp)
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "Step 1: Identify Prison Facility",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            textAlign = TextAlign.Center
        )
        Text(
            text = "Enter the unique Jail ID where this kiosk hardware is being deployed.",
            fontSize = 13.sp,
            color = Color(0xFF94A3B8),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp, bottom = 24.dp)
        )

        OutlinedTextField(
            value = prisonId ?: "",
            onValueChange = onPrisonIdChange,
            label = { Text("Jail ID") },
            placeholder = { Text("enter your jail id... ") },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = Color(0xFF0F172A),
                unfocusedContainerColor = Color(0xFF0F172A),
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedBorderColor = Color(0xFF3B82F6),
                unfocusedBorderColor = Color(0xFF334155),
                focusedLabelColor = Color(0xFF60A5FA),
                unfocusedLabelColor = Color(0xFF94A3B8)
            ),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onNext,
            enabled = (prisonId?.isNotBlank() == true) && !isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB))
        ) {
            Text("Continue to Setup PIN", fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.width(8.dp))
            Icon(imageVector = Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun StepEnterPin(
    prisonId: String?,
    pin: String,
    isLoading: Boolean,
    onPinChange: (String) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 500.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.Lock,
            contentDescription = null,
            tint = Color(0xFF60A5FA),
            modifier = Modifier.size(48.dp)
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "Step 2: Enter Jail Setup PIN",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            textAlign = TextAlign.Center
        )
        Text(
            text = "Enter the 6-digit Setup PIN configured by the Warden for facility: $prisonId.",
            fontSize = 13.sp,
            color = Color(0xFF94A3B8),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp, bottom = 24.dp)
        )


        OutlinedTextField(
            value = pin,
            onValueChange = { if (it.length <= 6) onPinChange(it) },
            label = { Text("6-Digit Setup PIN") },
            placeholder = { Text("enter kiosk setup pin") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = Color(0xFF0F172A),
                unfocusedContainerColor = Color(0xFF0F172A),
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedBorderColor = Color(0xFF3B82F6),
                unfocusedBorderColor = Color(0xFF334155),
                focusedLabelColor = Color(0xFF60A5FA),
                unfocusedLabelColor = Color(0xFF94A3B8)
            ),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(24.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick = onBack,
                modifier = Modifier
                    .weight(1f)
                    .height(50.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Color(0xFF475569))
            ) {
                Text("Back", color = Color(0xFF94A3B8), fontSize = 15.sp)
            }

            Button(
                onClick = onNext,
                enabled = pin.length == 6 && !isLoading,
                modifier = Modifier
                    .weight(1.5f)
                    .height(50.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB))
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White)
                } else {
                    Text("Validate PIN", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.width(6.dp))
                    Icon(imageVector = Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

@Composable
private fun StepSubmitDeviceInfo(
    uiState: RegistrationUiState,
    onLocationChange: (String) -> Unit,
    onBack: () -> Unit,
    onSubmit: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 550.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.PhonelinkSetup,
            contentDescription = null,
            tint = Color(0xFF60A5FA),
            modifier = Modifier.size(44.dp)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Step 3: Confirm Device Info",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            textAlign = TextAlign.Center
        )
        Text(
            text = "Device telemetry will be transmitted to the Warden for authorization.",
            fontSize = 12.sp,
            color = Color(0xFF94A3B8),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp)
        )

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            color = Color(0xFF0F172A),
            border = BorderStroke(1.dp, Color(0xFF334155))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                InfoRow("Facility ID", uiState.prisonIdInput)
                InfoRow("Serial No.", uiState.deviceSerial)
                InfoRow("Model", "${uiState.deviceBrand} / ${uiState.deviceModel}")
                InfoRow("IP Address", uiState.ipAddress)
                InfoRow("OS Version", uiState.androidVersion)
                InfoRow("App Version", uiState.appVersion)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = uiState.locationInput,
            onValueChange = onLocationChange,
            label = { Text("Specific Kiosk Location / Wing") },
            placeholder = { Text("e.g. Block A - Entrance 2") },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = Color(0xFF0F172A),
                unfocusedContainerColor = Color(0xFF0F172A),
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedBorderColor = Color(0xFF3B82F6),
                unfocusedBorderColor = Color(0xFF334155),
                focusedLabelColor = Color(0xFF60A5FA),
                unfocusedLabelColor = Color(0xFF94A3B8)
            ),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(20.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick = onBack,
                modifier = Modifier
                    .weight(1f)
                    .height(50.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Color(0xFF475569))
            ) {
                Text("Back", color = Color(0xFF94A3B8), fontSize = 15.sp)
            }

            Button(
                onClick = onSubmit,
                enabled = !uiState.isLoading,
                modifier = Modifier
                    .weight(1.5f)
                    .height(50.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White)
                } else {
                    Icon(imageVector = Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Submit Request", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun StepPendingApproval(
    uiState: RegistrationUiState,
    onCheckStatus: () -> Unit,
    onReRegister: () -> Unit,
    onChangeData: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 500.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(52.dp),
            color = Color(0xFF3B82F6),
            strokeWidth = 3.5.dp
        )
        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Waiting for Warden Approval",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            textAlign = TextAlign.Center
        )

        Text(
            text = "Registration request submitted. Awaiting Warden review.",
            fontSize = 13.sp,
            color = Color(0xFF94A3B8),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 4.dp, bottom = 20.dp)
        )

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            color = Color(0xFF0F172A),
            border = BorderStroke(1.dp, Color(0xFF334155))
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                InfoRow("Request ID", uiState.requestId)
                InfoRow("Device Serial", uiState.deviceSerial)
                InfoRow("Status", uiState.approvalStatus.uppercase())
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Auto-checking status every 15s...",
                    fontSize = 11.sp,
                    color = Color(0xFF64748B)
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onCheckStatus,
            enabled = !uiState.isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3B82F6))
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White)
            } else {
                Icon(imageVector = Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Check Status Now", fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
        }

        if (uiState.approvalStatus == "rejected") {
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = onReRegister,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Color(0xFF10B981))
            ) {
                Text("Retry Registration", color = Color(0xFF34D399), fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(
                onClick = onChangeData,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Color(0xFF475569))
            ) {
                Text("Change Data & Re-submit", color = Color(0xFF94A3B8), fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, fontSize = 12.sp, color = Color(0xFF94A3B8))
        Text(
            text = value.orEmpty().ifEmpty { "N/A" },
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White
        )
    }
}
