package com.prisonconnect.kiosk.ui.auth

import androidx.camera.core.*
import androidx.camera.view.PreviewView
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.hardware.FaceAuthProcessor
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import kotlin.time.Duration.Companion.milliseconds

@Composable
fun LoginScreen(
    @Suppress("UNUSED_PARAMETER") windowSizeClass: WindowSizeClass,
    onLoginSuccess: () -> Unit,
    onAdminLoginSuccess: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel()
) {
    val stage by viewModel.loginStage.collectAsState()
    val inmate by viewModel.identifiedInmate.collectAsState()
    val admin by viewModel.identifiedAdmin.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val faceQuality by viewModel.faceQuality.collectAsState()
    val isNetworkAvailable by viewModel.isNetworkAvailable.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.navigationEvent.collect { event ->
            when (event) {
                is LoginViewModel.LoginNavigation.NavigateToDashboard -> onLoginSuccess()
                is LoginViewModel.LoginNavigation.NavigateToAdminDashboard -> onAdminLoginSuccess()
            }
        }
    }

    if (!isNetworkAvailable) {
        NoInternetScreen(onRetry = {
            viewModel.resetToSelection()
        })
    } else {
        Scaffold(
            topBar = { KioskTopBar(title = "PRISON KIOSK LOGIN", isOnline = true) },
            containerColor = AppleGray
        ) { padding ->
            Box(
                modifier = Modifier
                    .padding(padding)
                    .fillMaxSize()
            ) {
            AnimatedContent(
                targetState = stage,
                transitionSpec = {
                    fadeIn() + slideInHorizontally { it } togetherWith fadeOut() + slideOutHorizontally { -it }
                },
                label = "LoginTransition"
            ) { targetStage ->
                when (targetStage) {
                    LoginStage.METHOD_SELECTION -> WelcomeSelectionLayout(
                        onFaceClick = { viewModel.startFaceAuth() },
                        onFingerprintClick = { viewModel.startFingerprintAuth() },
                        onRfidClick = { viewModel.startRfidAuth() },
                        onPrisonerIdClick = { viewModel.startPrisonerIdEntry() },
                        onAdminClick = { viewModel.startAdminAuth() }
                    )
                    LoginStage.FACE_SCANNING -> FaceScanningLayout(
                        quality = faceQuality,
                        onFaceCaptured = { viewModel.onValidFaceCaptured(it) },
                        onFaceDetected = { viewModel.onFaceDetected(it) },
                        onCancel = { viewModel.resetToSelection() }
                    )
                    LoginStage.FINGERPRINT_SCANNING -> FingerprintScanningLayout(
                        viewModel = viewModel,
                        onCancel = { viewModel.resetToSelection() }
                    )
                    LoginStage.RFID_SCANNING -> RfidScanningLayout(
                        onRfidScanned = { viewModel.onRfidScanned(it) },
                        onCancel = { viewModel.resetToSelection() }
                    )
                    LoginStage.PRISONER_ID_ENTRY -> PrisonerIdEntryLayout(
                        uiState = uiState,
                        onPrisonerIdSubmit = { viewModel.onPrisonerIdSubmit(it) },
                        onCancel = { viewModel.resetToSelection() }
                    )
                    LoginStage.PIN_ENTRY -> PinEntryLayout(
                        name = inmate?.let { "${it.firstName} ${it.lastName}" } ?: "Prisoner",
                        uiState = uiState,
                        onPinSubmit = { viewModel.onPinSubmit(it) },
                        onCancel = { viewModel.resetToSelection() }
                    )
                    LoginStage.ADMIN_USERNAME_ENTRY -> AdminUsernameEntryLayout(
                        uiState = uiState,
                        onUsernameSubmit = { viewModel.onAdminUsernameSubmit(it) },
                        onCancel = { viewModel.resetToSelection() }
                    )
                    LoginStage.ADMIN_PIN_ENTRY -> AdminPinEntryLayout(
                        adminName = admin?.name ?: "Admin User",
                        uiState = uiState,
                        onPinSubmit = { viewModel.onAdminPasswordSubmit(it) },
                        onCancel = { viewModel.resetToSelection() }
                    )
                }
            }

            if (uiState is UiState.Loading && stage != LoginStage.METHOD_SELECTION) {
                PremiumLoadingOverlay(
                    message = when (stage) {
                        LoginStage.PRISONER_ID_ENTRY -> "Identifying Prisoner..."
                        LoginStage.ADMIN_USERNAME_ENTRY -> "Identifying Admin..."
                        LoginStage.PIN_ENTRY, LoginStage.ADMIN_PIN_ENTRY -> "Verifying PIN..."
                        LoginStage.FACE_SCANNING, LoginStage.FINGERPRINT_SCANNING, LoginStage.RFID_SCANNING -> "Authenticating..."
                        else -> "Please wait..."
                    }
                )
            }
        }
    }
}
}

@Composable
fun RfidScanningLayout(
    @Suppress("UNUSED_PARAMETER") onRfidScanned: (String) -> Unit,
    onCancel: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.CreditCard,
            contentDescription = null,
            tint = PremiumBlue,
            modifier = Modifier.size(120.dp)
        )

        Spacer(modifier = Modifier.height(40.dp))

        Text(
            text = "RFID Card Authentication",
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            color = PremiumNavy
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Tap your RFID card on the reader",
            fontSize = 18.sp,
            color = Color.Gray,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(48.dp))

        Surface(
            color = Color.White.copy(alpha = 0.9f),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(0.8f).border(1.dp, Color.LightGray, RoundedCornerShape(16.dp))
        ) {
            Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "Waiting for RFID scan...",
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center,
                    color = PremiumNavy
                )
                Spacer(modifier = Modifier.height(16.dp))
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = PremiumBlue,
                    trackColor = Color.LightGray
                )
            }
        }

        Spacer(modifier = Modifier.height(60.dp))

        TextButton(onClick = onCancel) {
            Text("<- Back to Login Methods", color = AccentBlue, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun AdminUsernameEntryLayout(
    uiState: UiState<Unit>,
    onUsernameSubmit: (String) -> Unit,
    onCancel: () -> Unit
) {
    var username by remember { mutableStateOf("") }
    val error = (uiState as? UiState.Error)?.message

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.AdminPanelSettings,
            contentDescription = null,
            tint = PremiumBlue,
            modifier = Modifier.size(80.dp)
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text("Admin Login", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = PremiumNavy)
        Text("Enter your username or Employee ID", fontSize = 20.sp, color = Color.Gray, modifier = Modifier.padding(top = 8.dp))

        Spacer(modifier = Modifier.height(48.dp))

        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("Username / Employee ID") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Text
            )
        )

        Spacer(modifier = Modifier.height(24.dp))

        if (error != null) {
            Text(error, color = ErrorRed, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 16.dp))
        }

        Button(
            onClick = {
                if (username.isNotEmpty()) {
                    onUsernameSubmit(username)
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF003366), contentColor = Color.White),
            enabled = username.isNotEmpty()
        ) {
            Text("Continue to Password", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Spacer(modifier = Modifier.width(8.dp))
            Icon(Icons.AutoMirrored.Default.ArrowForward, contentDescription = null, tint = Color.White)
        }

        Spacer(modifier = Modifier.height(16.dp))
        TextButton(onClick = onCancel) {
            Text("<- Back to Login Methods", color = AccentBlue, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun FingerprintScanningLayout(
    viewModel: LoginViewModel,
    onCancel: () -> Unit
) {
    val device by viewModel.connectedScanner.collectAsState()
    val hasPermission by viewModel.usbPermissionGranted.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Fingerprint,
            contentDescription = null,
            tint = if (device != null && hasPermission) SuccessGreen else Color.Gray,
            modifier = Modifier.size(120.dp)
        )

        Spacer(modifier = Modifier.height(40.dp))

        Text(
            text = "Fingerprint Identification",
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            color = PremiumNavy
        )

        Spacer(modifier = Modifier.height(16.dp))

        Surface(
            color = Color.White.copy(alpha = 0.9f),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(0.8f).border(1.dp, Color.LightGray, RoundedCornerShape(16.dp))
        ) {
            Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                if (device == null) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Searching for physical scanner...", color = Color.Gray, textAlign = TextAlign.Center)
                } else {
                    val vid = String.format("%04X", device?.vendorId)
                    val pid = String.format("%04X", device?.productId)

                    Icon(Icons.Default.Usb, contentDescription = null, tint = PremiumBlue)
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Device Detected\nVID: $vid | PID: $pid",
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        color = PremiumNavy
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Status: Unsupported Hardware",
                        color = ErrorRed,
                        fontWeight = FontWeight.Medium
                    )

                    if (!hasPermission) {
                        Spacer(modifier = Modifier.height(20.dp))
                        Button(
                            onClick = { viewModel.requestUsbPermission() },
                            colors = ButtonDefaults.buttonColors(containerColor = PremiumBlue, contentColor = Color.White)
                        ) {
                            Text("Request USB Permission", color = Color.White)
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(60.dp))

        TextButton(onClick = onCancel) {
            Text("<- Back to Login Methods", color = AccentBlue, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun FaceScanningLayout(
    quality: FaceAuthProcessor.FaceQuality,
    onFaceCaptured: (android.graphics.Bitmap) -> Unit,
    onFaceDetected: (FaceAuthProcessor.FaceQuality) -> Unit,
    onCancel: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val faceAuthProcessor = remember { FaceAuthProcessor(context) }
    val scope = rememberCoroutineScope()

    val previewView = remember {
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }

    var cameraProvider: androidx.camera.lifecycle.ProcessCameraProvider? by remember { mutableStateOf(null) }

    LaunchedEffect(Unit) {
        cameraProvider = androidx.camera.lifecycle.ProcessCameraProvider.getInstance(context).get()
        val preview = androidx.camera.core.Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
        }

        val imageAnalyzer = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also {
                it.setAnalyzer(cameraExecutor) { imageProxy ->
                    scope.launch {
                        try {
                            val faces = faceAuthProcessor.detectFaces(imageProxy)
                            if (faces.isEmpty()) {
                                onFaceDetected(FaceAuthProcessor.FaceQuality.NO_FACE)
                            } else if (faces.size > 1) {
                                onFaceDetected(FaceAuthProcessor.FaceQuality.MULTIPLE_FACES)
                            } else {
                                val faceQuality = faceAuthProcessor.validateFace(
                                    faces[0],
                                    imageProxy.width,
                                    imageProxy.height
                                )
                                onFaceDetected(faceQuality)

                                if (faceQuality == FaceAuthProcessor.FaceQuality.GOOD) {
                                    val bitmap = faceAuthProcessor.imageProxyToBitmap(imageProxy)
                                    if (bitmap != null) {
                                        if (!faceAuthProcessor.isBlurry(bitmap)) {
                                            onFaceCaptured(bitmap)
                                        } else {
                                            onFaceDetected(FaceAuthProcessor.FaceQuality.BLURRY)
                                        }
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            com.prisonconnect.kiosk.core.Logger.e("Analyzer error", e)
                        } finally {
                            imageProxy.close()
                        }
                    }
                }
            }

        try {
            cameraProvider?.unbindAll()
            cameraProvider?.bindToLifecycle(
                lifecycleOwner,
                CameraSelector.DEFAULT_FRONT_CAMERA,
                preview,
                imageAnalyzer
            )
        } catch (e: Exception) {
            com.prisonconnect.kiosk.core.Logger.e("Camera binding failed", e)
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            cameraExecutor.shutdown()
            try {
                cameraProvider?.unbindAll()
            } catch (e: Exception) {
                com.prisonconnect.kiosk.core.Logger.e("Camera release failed", e)
            }
        }
    }


    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            factory = { previewView },
            modifier = Modifier.fillMaxSize()
        )

        FaceOverlay(quality)

        Surface(
            color = Color.Black.copy(alpha = 0.6f),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 40.dp)
        ) {
            Text(
                text = when (quality) {
                    FaceAuthProcessor.FaceQuality.GOOD -> "Stay still..."
                    FaceAuthProcessor.FaceQuality.TOO_FAR -> "Move closer"
                    FaceAuthProcessor.FaceQuality.NOT_CENTERED -> "Center your face"
                    FaceAuthProcessor.FaceQuality.NOT_STRAIGHT -> "Look straight"
                    FaceAuthProcessor.FaceQuality.BLURRY -> "Hold steady (Blurry)"
                    FaceAuthProcessor.FaceQuality.NO_FACE -> "Position your face"
                    FaceAuthProcessor.FaceQuality.MULTIPLE_FACES -> "Ensure only one face"
                },
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp)
            )
        }

        IconButton(
            onClick = onCancel,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(32.dp)
                .size(64.dp)
                .background(Color.White.copy(alpha = 0.2f), CircleShape)
        ) {
            Icon(Icons.Default.Close, contentDescription = "Cancel", tint = Color.White, modifier = Modifier.size(32.dp))
        }
    }
}

@Composable
fun FaceOverlay(quality: FaceAuthProcessor.FaceQuality) {
    val infiniteTransition = rememberInfiniteTransition(label = "Overlay")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 0.8f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "Alpha"
    )

    Canvas(modifier = Modifier.fillMaxSize()) {
        val strokeColor = if (quality == FaceAuthProcessor.FaceQuality.GOOD) SuccessGreen else Color.White
        val path = Path().apply {
            addOval(Rect(center.x - 150.dp.toPx(), center.y - 200.dp.toPx(), center.x + 150.dp.toPx(), center.y + 200.dp.toPx()))
        }
        drawPath(
            path = path,
            color = strokeColor.copy(alpha = if (quality == FaceAuthProcessor.FaceQuality.GOOD) alpha else 0.5f),
            style = Stroke(width = 4.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(20f, 10f), 0f))
        )
    }
}

@Composable
fun WelcomeSelectionLayout(
    onFaceClick: () -> Unit,
    onFingerprintClick: () -> Unit,
    onRfidClick: () -> Unit,
    onPrisonerIdClick: () -> Unit,
    onAdminClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "Login Methods", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = PremiumNavy)
        Text(text = "Choose a method to login", fontSize = 16.sp, color = Color.Gray, modifier = Modifier.padding(top = 8.dp))

        Spacer(modifier = Modifier.height(60.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            PremiumAuthCard(
                title = "Face ID",
                icon = Icons.Default.Face,
                description = "Secure Recognition",
                onClick = onFaceClick,
                modifier = Modifier.weight(1f)
            )
            PremiumAuthCard(
                title = "Fingerprint",
                icon = Icons.Default.Fingerprint,
                description = "USB Scanner",
                onClick = onFingerprintClick,
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            PremiumAuthCard(
                title = "RFID Card",
                icon = Icons.Default.CreditCard,
                description = "Tap Card",
                onClick = onRfidClick,
                modifier = Modifier.weight(1f)
            )
            PremiumAuthCard(
                title = "Prisoner ID",
                icon = Icons.Default.Badge,
                description = "Enter ID",
                onClick = onPrisonerIdClick,
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(modifier = Modifier.height(48.dp))

        TextButton(
            onClick = onAdminClick,
            colors = ButtonDefaults.textButtonColors(contentColor = Color.Gray)
        ) {
            Icon(Icons.Default.AdminPanelSettings, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Admin Login", fontSize = 14.sp, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
fun PinEntryLayout(
    name: String,
    uiState: UiState<Unit>,
    onPinSubmit: (String) -> Unit,
    onCancel: () -> Unit
) {
    var pin by remember { mutableStateOf("") }
    val error = (uiState as? UiState.Error)?.message

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Welcome,", fontSize = 24.sp, color = Color.Gray)
        Text(name, fontSize = 36.sp, fontWeight = FontWeight.Black, color = PremiumNavy)
        Text("Enter your 6-digit PIN to confirm", fontSize = 16.sp, color = Color.Gray, modifier = Modifier.padding(top = 16.dp))

        Spacer(modifier = Modifier.height(48.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            repeat(6) { index ->
                val filled = pin.length > index
                Box(
                    modifier = Modifier.size(20.dp).clip(CircleShape)
                        .background(if (filled) PremiumNavy else Color.LightGray.copy(alpha = 0.5f))
                        .border(1.dp, if (filled) PremiumNavy else Color.Gray, CircleShape)
                )
            }
        }

        Spacer(modifier = Modifier.height(48.dp))

        if (error != null) {
            Text(error, color = ErrorRed, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 24.dp))
            LaunchedEffect(error) { delay(1500.milliseconds); pin = "" }
        }

        IPhoneKeypad(
            onNumberClick = { if (pin.length < 6) { pin += it; if (pin.length == 6) onPinSubmit(pin) } },
            onDeleteClick = { if (pin.isNotEmpty()) pin = pin.dropLast(1) }
        )

        Spacer(modifier = Modifier.height(40.dp))
        TextButton(onClick = onCancel) {
            Text("<- Back to Login Methods", color = AccentBlue, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun AdminPinEntryLayout(
    adminName: String,
    uiState: UiState<Unit>,
    onPinSubmit: (String) -> Unit,
    onCancel: () -> Unit
) {
    var password by remember { mutableStateOf("") }
    val error = (uiState as? UiState.Error)?.message

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.AdminPanelSettings,
            contentDescription = null,
            tint = PremiumBlue,
            modifier = Modifier.size(80.dp)
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text("Admin Access", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = PremiumNavy)
        Text("Welcome, $adminName", fontSize = 20.sp, color = Color.Gray, modifier = Modifier.padding(top = 8.dp))
        Text("Enter your password to continue", fontSize = 16.sp, color = Color.Gray, modifier = Modifier.padding(top = 16.dp))

        Spacer(modifier = Modifier.height(48.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            singleLine = true,
            leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
            visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Password
            ),
            isError = error != null
        )

        Spacer(modifier = Modifier.height(24.dp))

        if (error != null) {
            Text(error, color = ErrorRed, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 16.dp))
        }

        Button(
            onClick = {
                if (password.isNotEmpty()) {
                    onPinSubmit(password)
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF003366), contentColor = Color.White),
            enabled = password.isNotEmpty()
        ) {
            Text("Login", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Spacer(modifier = Modifier.width(8.dp))
            Icon(Icons.AutoMirrored.Default.ArrowForward, contentDescription = null, tint = Color.White)
        }

        Spacer(modifier = Modifier.height(16.dp))
        TextButton(onClick = onCancel) {
            Text("<- Back to Login Methods", color = AccentBlue, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun PrisonerIdEntryLayout(
    uiState: UiState<Unit>,
    onPrisonerIdSubmit: (String) -> Unit,
    onCancel: () -> Unit
) {
    var prisonerId by remember { mutableStateOf("") }
    val error = (uiState as? UiState.Error)?.message

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Badge,
            contentDescription = null,
            tint = PremiumBlue,
            modifier = Modifier.size(80.dp)
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text("Prisoner Login", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = PremiumNavy)
        Text("Enter your Prisoner ID", fontSize = 20.sp, color = Color.Gray, modifier = Modifier.padding(top = 8.dp))
        TextButton(onClick = onCancel) {
            Text("<- Back to Login Methods", color = AccentBlue, fontWeight = FontWeight.Bold)
        }
        Spacer(modifier = Modifier.height(48.dp))

        Surface(
            color = Color.White,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .border(2.dp, PremiumBlue, RoundedCornerShape(16.dp))
                .padding(horizontal = 16.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 20.dp, horizontal = 24.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = prisonerId.ifEmpty { "------" },
                    fontSize = 36.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (prisonerId.isEmpty()) Color.Gray else PremiumNavy,
                    letterSpacing = 4.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(48.dp))

        if (error != null) {
            Text(error, color = ErrorRed, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 16.dp))
        }

        IPhoneKeypad(
            onNumberClick = {
                if (prisonerId.length < 6) {
                    val newId = prisonerId + it
                    prisonerId = newId
                    // Auto-submit when 6 digits are entered
                    if (newId.length == 6) {
                        onPrisonerIdSubmit(newId)
                    }
                }
            },
            onDeleteClick = {
                if (prisonerId.isNotEmpty()) {
                    prisonerId = prisonerId.dropLast(1)
                }
            }
        )

        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = {
                if (prisonerId.isNotEmpty() && prisonerId.length == 6) {
                    onPrisonerIdSubmit(prisonerId)
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF003366), contentColor = Color.White),
            enabled = prisonerId.length == 6
        ) {
            Text("Continue to PIN", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Spacer(modifier = Modifier.width(8.dp))
            Icon(Icons.AutoMirrored.Default.ArrowForward, contentDescription = null, tint = Color.White)
        }

        Spacer(modifier = Modifier.height(16.dp))
        TextButton(onClick = onCancel) {
            Text("<- Back to Login Methods", color = AccentBlue, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun NoInternetScreen(onRetry: () -> Unit = {}) {
    // Gentle pulse animation for the icon rings — signals "we're on it".
    val infiniteTransition = rememberInfiniteTransition(label = "netPulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.55f,
        targetValue = 0.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "netPulseAlpha"
    )
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.55f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "netPulseScale"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFF0A1628), Color(0xFF10233F), Color(0xFF0A1628))
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxWidth()
        ) {
            // Pulsing rings behind the wifi-off badge
            Box(contentAlignment = Alignment.Center) {
                Box(
                    modifier = Modifier
                        .size(150.dp)
                        .scale(pulseScale)
                        .alpha(pulseAlpha)
                        .background(Color(0xFF3B82F6), CircleShape)
                )
                Box(
                    modifier = Modifier
                        .size(118.dp)
                        .background(Color(0xFF132A4A), CircleShape)
                )
                Icon(
                    imageVector = Icons.Default.WifiOff,
                    contentDescription = null,
                    tint = Color(0xFF7EB3FF),
                    modifier = Modifier.size(56.dp)
                )
            }

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "Connection Lost",
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "The kiosk lost its internet connection.\nTrying to reconnect automatically…",
                fontSize = 16.sp,
                color = Color(0xFF9DB2CC),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 40.dp)
            )

            Spacer(modifier = Modifier.height(40.dp))

            OutlinedButton(
                onClick = onRetry,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.5.dp, Color(0xFF3B82F6)),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                modifier = Modifier
                    .padding(horizontal = 48.dp)
                    .fillMaxWidth()
                    .height(54.dp)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, tint = Color(0xFF7EB3FF))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Check Again", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewLoginMobile() {
    PrisonKioskTheme {
        Surface(color = AppleGray, modifier = Modifier.fillMaxSize()) {
            PinEntryLayout(name = "RAHUL KUMAR", uiState = UiState.Idle, onPinSubmit = {}, onCancel = {})
        }
    }
}

