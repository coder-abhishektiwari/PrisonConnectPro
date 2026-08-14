package com.prisonconnect.kiosk.ui.call

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.ui.components.KioskButton
import com.prisonconnect.kiosk.ui.components.KioskProgressIndicator
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

// --- Color Palette ---
private val LightScreenBg = Color(0xFFF4F7FA)
private val TextDark = Color(0xFF1E293B)
private val TextGray = Color(0xFF64748B)
private val PrimaryBlue = Color(0xFF003366)
private val AlertRed = Color(0xFFE53935)
private val AccentGreen = Color(0xFF2E7D32)
private val ControlBtnBg = Color(0xFFF1F5F9)
private val WarningOrange = Color(0xFFF59E0B)

@Composable
fun AudioCallScreen(
    contactName: String,
    roomId: String,
    @Suppress("UNUSED_PARAMETER") windowSizeClass: WindowSizeClass,
    onEndCall: () -> Unit,
    viewModel: CallViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val timerSeconds by viewModel.timerSeconds.collectAsState()
    val isMuted by viewModel.isMuted.collectAsState()
    val isSpeakerOn by viewModel.isSpeakerOn.collectAsState()
    val callState by viewModel.callState.collectAsState()
    val isNetworkAvailable by viewModel.isNetworkAvailable.collectAsState()
    val isRecording by viewModel.isRecording.collectAsState()
    val inmateProfile by viewModel.inmateProfile.collectAsState()

    var hasPermissions by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        )
    }

    var permissionDeniedOnce by remember { mutableStateOf(false) }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.RECORD_AUDIO] == true
        hasPermissions = granted
        if (!granted) permissionDeniedOnce = true
    }

    LaunchedEffect(roomId, hasPermissions) {
        if (!hasPermissions && !permissionDeniedOnce) {
            launcher.launch(arrayOf(Manifest.permission.RECORD_AUDIO))
        } else if (hasPermissions) {
            viewModel.initCall(context, roomId, isVideoCall = false)
        }
    }

    LaunchedEffect(timerSeconds) {
        if (timerSeconds >= 300) {
            onEndCall()
        }
    }

    if (!hasPermissions && permissionDeniedOnce) {
        AudioPermissionDeniedUI(onRetry = {
            launcher.launch(arrayOf(Manifest.permission.RECORD_AUDIO))
        })
    } else {
        AudioCallContent(
            contactName = contactName,
            timerSeconds = timerSeconds,
            isMuted = isMuted,
            isSpeakerOn = isSpeakerOn,
            callState = callState,
            isNetworkAvailable = isNetworkAvailable,
            isRecording = isRecording,
            inmateProfile = inmateProfile,
            onMuteToggle = { viewModel.toggleMute() },
            onSpeakerToggle = { viewModel.toggleSpeaker() },
            onEndCall = onEndCall
        )
    }
}

@Composable
fun AudioPermissionDeniedUI(onRetry: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(LightScreenBg),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier.padding(32.dp).fillMaxWidth(0.6f),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier.padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(Icons.Default.MicOff, null, tint = AlertRed, modifier = Modifier.size(64.dp))
                Spacer(modifier = Modifier.height(24.dp))
                Text("Microphone Required", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = TextDark)
                Spacer(modifier = Modifier.height(12.dp))
                Text("We need access to your microphone to start the audio call. Please grant permission to continue.", style = MaterialTheme.typography.bodyLarge, color = TextGray, textAlign = TextAlign.Center)
                Spacer(modifier = Modifier.height(32.dp))
                KioskButton(text = "Grant Permission", onClick = onRetry, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
fun AudioCallContent(
    contactName: String,
    timerSeconds: Int,
    isMuted: Boolean,
    isSpeakerOn: Boolean,
    callState: CallUIState,
    isNetworkAvailable: Boolean,
    isRecording: Boolean,
    inmateProfile: InmateProfile?,
    onMuteToggle: () -> Unit,
    onSpeakerToggle: () -> Unit,
    onEndCall: () -> Unit
) {
    var showInfoDialog by remember { mutableStateOf(false) }

    val maxCallDuration = 300
    val remainingSeconds = (maxCallDuration - timerSeconds).coerceAtLeast(0)

    val formatTime = { seconds: Int ->
        val mins = seconds / 60
        val secs = seconds % 60
        String.format("%02d:%02d", mins, secs)
    }

    val currentCost = ((timerSeconds / 60) + 1) * 1.00

    Scaffold(
        containerColor = LightScreenBg
    ) { padding ->
        BoxWithConstraints(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            val isTablet = maxWidth >= 600.dp

            // Top Status Bar (Recording & Signal)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (isRecording) {
                    RecordingBadge()
                } else {
                    Spacer(modifier = Modifier.width(1.dp))
                }
                ConnectionQualityBadge(isTablet)
            }

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(if (isTablet) 40.dp else 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween
            ) {

                // -------------------------------------------------------------
                // 1. CENTER PROFILE & CONTACT DETAILS
                // -------------------------------------------------------------
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.weight(1f)
                ) {
                    // Profile Avatar
                    Surface(
                        modifier = Modifier
                            .size(if (isTablet) 200.dp else 120.dp)
                            .clip(CircleShape)
                            .border(4.dp, PrimaryBlue.copy(alpha = 0.15f), CircleShape),
                        color = Color.White,
                        shadowElevation = 8.dp
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = null,
                                modifier = Modifier.size(if (isTablet) 120.dp else 70.dp),
                                tint = PrimaryBlue
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(if (isTablet) 32.dp else 20.dp))

                    Text(
                        text = contactName,
                        fontSize = if (isTablet) 36.sp else 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextDark
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    if (callState == CallUIState.CONNECTED) {
                        Surface(
                            color = AccentGreen.copy(alpha = 0.1f),
                            shape = RoundedCornerShape(50)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(AccentGreen)
                                )
                                Text(
                                    text = "Call in Progress • ${formatTime(timerSeconds)}",
                                    fontSize = if (isTablet) 18.sp else 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = AccentGreen
                                )
                            }
                        }
                    } else {
                        Text(
                            text = when(callState) {
                                CallUIState.WAITING -> "Waiting for participant..."
                                CallUIState.RECONNECTING -> "Reconnecting..."
                                CallUIState.FAILED -> "Call Failed"
                                else -> "Connecting..."
                            },
                            fontSize = if (isTablet) 20.sp else 16.sp,
                            color = TextGray
                        )
                        if (callState != CallUIState.FAILED) {
                            Spacer(modifier = Modifier.height(12.dp))
                            KioskProgressIndicator()
                        }
                    }
                }

                // Network lost overlay
                if (!isNetworkAvailable) {
                    Surface(
                        color = WarningOrange,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.padding(bottom = 20.dp)
                    ) {
                        Text(
                            "Network Lost. Connecting...",
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // -------------------------------------------------------------
                // 2. BOTTOM CONTROL TOOLBAR
                // -------------------------------------------------------------
                Surface(
                    modifier = Modifier
                        .fillMaxWidth(if (isTablet) 0.85f else 1f),
                    shape = RoundedCornerShape(if (isTablet) 32.dp else 24.dp),
                    color = Color.White,
                    shadowElevation = 8.dp
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(
                                horizontal = if (isTablet) 32.dp else 16.dp,
                                vertical = if (isTablet) 24.dp else 16.dp
                            ),
                        horizontalArrangement = Arrangement.SpaceAround,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CallActionButton(
                            icon = if (isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                            label = if (isMuted) "Unmute" else "Mute",
                            isActive = isMuted,
                            activeColor = AlertRed,
                            isTablet = isTablet,
                            onClick = onMuteToggle
                        )

                        CallActionButton(
                            icon = if (isSpeakerOn) Icons.Default.VolumeUp else Icons.Default.VolumeOff,
                            label = "Speaker",
                            isActive = isSpeakerOn,
                            activeColor = PrimaryBlue,
                            isTablet = isTablet,
                            onClick = onSpeakerToggle
                        )

                        CallActionButton(
                            icon = Icons.Default.Info,
                            label = "Call Info",
                            isActive = showInfoDialog,
                            activeColor = PrimaryBlue,
                            isTablet = isTablet,
                            onClick = { showInfoDialog = true }
                        )

                        CallActionButton(
                            icon = Icons.Default.CallEnd,
                            label = "End",
                            isActive = true,
                            activeColor = AlertRed,
                            isEndCall = true,
                            isTablet = isTablet,
                            onClick = onEndCall
                        )
                    }
                }
            }

            // -------------------------------------------------------------
            // 3. CALL INFO DIALOG MODAL
            // -------------------------------------------------------------
            if (showInfoDialog) {
                Dialog(onDismissRequest = { showInfoDialog = false }) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth(if (isTablet) 0.85f else 0.95f),
                        shape = RoundedCornerShape(24.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 10.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(if (isTablet) 28.dp else 20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Info,
                                        contentDescription = null,
                                        tint = PrimaryBlue,
                                        modifier = Modifier.size(if (isTablet) 28.dp else 22.dp)
                                    )
                                    Text(
                                        text = "Call Information",
                                        fontSize = if (isTablet) 22.sp else 18.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TextDark
                                    )
                                }

                                IconButton(onClick = { showInfoDialog = false }) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Close",
                                        tint = TextGray
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(20.dp))
                            HorizontalDivider(color = Color(0xFFE2E8F0))
                            Spacer(modifier = Modifier.height(20.dp))

                            // Inmate Detail
                            Surface(
                                color = LightScreenBg,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text("INMATE DETAILS", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextGray)
                                    Text("${inmateProfile?.firstName} ${inmateProfile?.lastName}", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                                    Text("Facility: ${inmateProfile?.facility}", fontSize = 12.sp, color = TextGray)
                                }
                            }

                            Spacer(modifier = Modifier.height(20.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        text = "TIME REMAINING",
                                        fontSize = if (isTablet) 12.sp else 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TextGray
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = formatTime(remainingSeconds),
                                        fontSize = if (isTablet) 26.sp else 20.sp,
                                        fontWeight = FontWeight.Black,
                                        color = if (remainingSeconds <= 60) AlertRed else PrimaryBlue
                                    )
                                }

                                Box(
                                    modifier = Modifier
                                        .width(1.dp)
                                        .height(40.dp)
                                        .background(Color(0xFFE2E8F0))
                                )

                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        text = "COST DEDUCTED",
                                        fontSize = if (isTablet) 12.sp else 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TextGray
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = "₹${String.format("%.2f", currentCost)}",
                                        fontSize = if (isTablet) 26.sp else 20.sp,
                                        fontWeight = FontWeight.Black,
                                        color = TextDark
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(24.dp))

                            Button(
                                onClick = { showInfoDialog = false },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(if (isTablet) 52.dp else 44.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
                            ) {
                                Text(
                                    text = "Close",
                                    fontSize = if (isTablet) 16.sp else 14.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RecordingBadge() {
    val infiniteTransition = rememberInfiniteTransition(label = "recording")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0.3f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    Surface(
        color = AlertRed.copy(alpha = 0.1f),
        shape = RoundedCornerShape(8.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, AlertRed)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(AlertRed.copy(alpha = alpha)))
            Spacer(modifier = Modifier.width(6.dp))
            Text("SECURE RECORDING", color = AlertRed, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ConnectionQualityBadge(isTablet: Boolean) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .background(PrimaryBlue.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Icon(
            imageVector = Icons.Default.SignalCellularAlt,
            contentDescription = null,
            tint = AccentGreen,
            modifier = Modifier.size(if (isTablet) 16.dp else 12.dp)
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = "Stable Connection",
            color = TextDark,
            fontSize = if (isTablet) 12.sp else 10.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

// -----------------------------------------------------------------------------
// COMPONENT: Reusable Call Control Button with Tablet Support
// -----------------------------------------------------------------------------
@Composable
private fun CallActionButton(
    icon: ImageVector,
    label: String,
    isActive: Boolean,
    activeColor: Color,
    isTablet: Boolean,
    isEndCall: Boolean = false,
    onClick: () -> Unit
) {
    val bgColor = when {
        isEndCall -> AlertRed
        isActive -> activeColor
        else -> ControlBtnBg
    }

    val iconColor = if (isEndCall || isActive) Color.White else TextDark

    val buttonSize = when {
        isTablet && isEndCall -> 80.dp
        isTablet -> 72.dp
        isEndCall -> 64.dp
        else -> 56.dp
    }

    val iconSize = when {
        isTablet && isEndCall -> 36.dp
        isTablet -> 30.dp
        isEndCall -> 30.dp
        else -> 24.dp
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(if (isTablet) 10.dp else 6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(buttonSize)
                .clip(CircleShape)
                .background(bgColor)
                .clickable { onClick() },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = iconColor,
                modifier = Modifier.size(iconSize)
            )
        }
        Text(
            text = label,
            fontSize = if (isTablet) 14.sp else 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (isEndCall) AlertRed else TextGray
        )
    }
}

// --- PREVIEWS ---

//@Preview(name = "Tablet Portrait", device = "spec:width=800dp,height=1280dp,orientation=portrait", showBackground = true)
//@Composable
//fun PreviewAudioCallTabletPortrait() {
//    PrisonKioskTheme {
//        AudioCallContent(
//            contactName = "Suresh Kumar (Brother)",
//            timerSeconds = 125,
//            isMuted = false,
//            isSpeakerOn = true,
//            callState = CallUIState.CONNECTED,
//            isNetworkAvailable = true,
//            isRecording = true,
//            inmateProfile = null,
//            onMuteToggle = {},
//            onSpeakerToggle = {},
//            onEndCall = {}
//        )
//    }
//}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewAudioCallMobile() {
    PrisonKioskTheme {
        AudioCallContent(
            contactName = "Suresh Kumar (Brother)",
            timerSeconds = 125,
            isMuted = true,
            isSpeakerOn = false,
            callState = CallUIState.CONNECTED,
            isNetworkAvailable = true,
            isRecording = true,
            inmateProfile = null,
            onMuteToggle = {},
            onSpeakerToggle = {},
            onEndCall = {}
        )
    }
}
