package com.prisonconnect.kiosk.ui.call

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.zIndex
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.models.inmate.InmateStatus
import com.prisonconnect.kiosk.ui.components.KioskButton
import com.prisonconnect.kiosk.ui.components.KioskProgressIndicator
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme
import kotlinx.coroutines.delay
import org.webrtc.VideoTrack
import kotlin.math.roundToInt

// Color Tokens
private val DarkControlsBg = Color(0xD90F172A)
private val AlertRed = Color(0xFFE53935)
private val AccentGreen = Color(0xFF10B981)
private val TextDark = Color(0xFF1E293B)
private val TextGray = Color(0xFF64748B)
private val PrimaryBlue = Color(0xFF0284C7)
private val WarningOrange = Color(0xFFF59E0B)

/**
 * Fallback WebRtcSurfaceView component.
 * If your project already contains a custom WebRtcSurfaceView composable,
 * remove this placeholder and import yours.
 */
@Composable
fun WebRtcSurfaceView(
    videoTrack: VideoTrack?,
    eglContext: org.webrtc.EglBase.Context?,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "Video Stream",
            color = Color.White.copy(alpha = 0.5f),
            fontSize = 12.sp
        )
    }
}

@Composable
fun VideoCallScreen(
    contactName: String,
    roomId: String,
    @Suppress("UNUSED_PARAMETER") windowSizeClass: WindowSizeClass,
    onEndCall: () -> Unit,
    viewModel: CallViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val timerSeconds by viewModel.timerSeconds.collectAsState()
    val isMuted by viewModel.isMuted.collectAsState()
    val isCameraOn by viewModel.isCameraOn.collectAsState()
    val isSpeakerOn by viewModel.isSpeakerOn.collectAsState()
    val callState by viewModel.callState.collectAsState()
    val isNetworkAvailable by viewModel.isNetworkAvailable.collectAsState()
    val isRecording by viewModel.isRecording.collectAsState()
    val inmateProfile by viewModel.inmateProfile.collectAsState()
    val contactProfile by viewModel.contactProfile.collectAsState()

    val localTrack by viewModel.localVideoTrack.collectAsState()
    val remoteTrack by viewModel.remoteVideoTrack.collectAsState()

    var hasPermissions by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        )
    }

    var permissionDeniedOnce by remember { mutableStateOf(false) }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.CAMERA] == true &&
            permissions[Manifest.permission.RECORD_AUDIO] == true
        hasPermissions = granted
        if (!granted) permissionDeniedOnce = true
    }

    LaunchedEffect(roomId, hasPermissions) {
        if (!hasPermissions && !permissionDeniedOnce) {
            launcher.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO))
        } else if (hasPermissions) {
            viewModel.initCall(context, roomId)
        }
    }

    LaunchedEffect(timerSeconds) {
        if (timerSeconds >= 300) {
            onEndCall()
        }
    }

    if (!hasPermissions && permissionDeniedOnce) {
        PermissionDeniedUI(onRetry = {
            launcher.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO))
        })
    } else {
        VideoCallContent(
            contactName = contactName,
            timerSeconds = timerSeconds,
            isMuted = isMuted,
            isCameraOn = isCameraOn,
            isSpeakerOn = isSpeakerOn,
            callState = callState,
            isNetworkAvailable = isNetworkAvailable,
            isRecording = isRecording,
            inmateProfile = inmateProfile,
            contactProfile = contactProfile,
            localTrack = localTrack,
            remoteTrack = remoteTrack,
            eglContext = viewModel.eglContext,
            onMuteToggle = { viewModel.toggleMute() },
            onVideoToggle = { viewModel.toggleCamera() },
            onSpeakerToggle = { viewModel.toggleSpeaker() },
            onSwitchCamera = { viewModel.switchCamera() },
            onEndCall = onEndCall
        )
    }
}

@Composable
fun PermissionDeniedUI(onRetry: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier
                .padding(24.dp)
                .fillMaxWidth(0.85f),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.Security,
                    contentDescription = null,
                    tint = AlertRed,
                    modifier = Modifier.size(56.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Permissions Required",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = TextDark
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Access to Camera and Microphone is required for secure video calling.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextGray,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(24.dp))
                KioskButton(
                    text = "Grant Permissions",
                    onClick = onRetry,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
fun VideoCallContent(
    contactName: String,
    timerSeconds: Int,
    isMuted: Boolean,
    isCameraOn: Boolean,
    isSpeakerOn: Boolean,
    callState: CallUIState,
    isNetworkAvailable: Boolean,
    isRecording: Boolean,
    inmateProfile: InmateProfile?,
    contactProfile: Contact?,
    localTrack: VideoTrack?,
    remoteTrack: VideoTrack?,
    eglContext: org.webrtc.EglBase.Context?,
    onMuteToggle: () -> Unit,
    onVideoToggle: () -> Unit,
    onSpeakerToggle: () -> Unit,
    onSwitchCamera: () -> Unit,
    onEndCall: () -> Unit
) {
    var showInfoDialog by remember { mutableStateOf(false) }
    var controlsVisible by remember { mutableStateOf(true) }
    var lastInteractionTime by remember { mutableLongStateOf(System.currentTimeMillis()) }

    val density = LocalDensity.current
    val configuration = LocalConfiguration.current
    val screenWidthPx = with(density) { configuration.screenWidthDp.dp.toPx() }
    val screenHeightPx = with(density) { configuration.screenHeightDp.dp.toPx() }

    // Offset positioned strictly BELOW top header to prevent overlap
    val initialTopOffsetPx = with(density) { 110.dp.toPx().toInt() }
    var pipOffset by remember { mutableStateOf(IntOffset(0, initialTopOffsetPx)) }

    val maxCallDuration = 300
    val remainingSeconds = (maxCallDuration - timerSeconds).coerceAtLeast(0)

    val formatTime = { seconds: Int ->
        val mins = seconds / 60
        val secs = seconds % 60
        String.format("%02d:%02d", mins, secs)
    }

    val currentCost = ((timerSeconds / 60) + 1) * 1.00

    LaunchedEffect(lastInteractionTime) {
        delay(6000)
        controlsVisible = false
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                indication = null
            ) {
                controlsVisible = true
                lastInteractionTime = System.currentTimeMillis()
            }
    ) {
        val isTablet = maxWidth >= 600.dp

        // 1. REMOTE FULLSCREEN VIDEO FEED
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF090D16)),
            contentAlignment = Alignment.Center
        ) {
            if (remoteTrack != null && callState == CallUIState.CONNECTED) {
                WebRtcSurfaceView(
                    videoTrack = remoteTrack,
                    eglContext = eglContext,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp)
                ) {
                    KioskProgressIndicator()
                    Spacer(modifier = Modifier.height(20.dp))
                    Text(
                        text = when (callState) {
                            CallUIState.WAITING -> "Waiting for $contactName..."
                            CallUIState.RECONNECTING -> "Reconnecting..."
                            CallUIState.FAILED -> "Call Failed"
                            else -> "Connecting..."
                        },
                        color = Color.White,
                        fontSize = if (isTablet) 20.sp else 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }

        // 2. DRAGGABLE PIP LOCAL CAMERA PREVIEW
        val pipWidth = if (isTablet) 160.dp else 105.dp
        val pipHeight = if (isTablet) 210.dp else 145.dp
        val pipWidthPx = with(density) { pipWidth.toPx() }
        val pipHeightPx = with(density) { pipHeight.toPx() }

        Surface(
            modifier = Modifier
                .zIndex(3f)
                .offset { pipOffset }
                .padding(end = 12.dp)
                .size(pipWidth, pipHeight)
                .align(Alignment.TopEnd)
                .clip(RoundedCornerShape(16.dp))
                .border(1.5.dp, Color.White.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                .pointerInput(Unit) {
                    detectDragGestures { change, dragAmount ->
                        change.consume()
                        val newX = (pipOffset.x + dragAmount.x).coerceIn(-screenWidthPx + pipWidthPx + 24, 0f)
                        val newY = (pipOffset.y + dragAmount.y).coerceIn(0f, screenHeightPx - pipHeightPx - 80)
                        pipOffset = IntOffset(newX.roundToInt(), newY.roundToInt())
                    }
                },
            color = Color(0xFF1E293B),
            shadowElevation = 8.dp
        ) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                if (!isCameraOn) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.VideocamOff,
                            contentDescription = null,
                            tint = Color.White.copy(alpha = 0.6f),
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("Off", color = Color.White.copy(alpha = 0.6f), fontSize = 10.sp)
                    }
                } else if (localTrack != null) {
                    WebRtcSurfaceView(
                        videoTrack = localTrack,
                        eglContext = eglContext,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Text("Preview", color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp)
                }
            }
        }

        // 3. CLEAN COMPACT TOP HEADER BAR
        AnimatedVisibility(
            visible = controlsVisible,
            enter = fadeIn() + slideInVertically(),
            exit = fadeOut() + slideOutVertically(),
            modifier = Modifier
                .align(Alignment.TopCenter)
                .zIndex(2f)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color.Black.copy(alpha = 0.9f), Color.Transparent)
                        )
                    )
                    .padding(horizontal = 12.dp, vertical = 10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Left Header Details
                    Column(modifier = Modifier.weight(1f, fill = false)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (isRecording) {
                                Surface(
                                    color = AlertRed,
                                    shape = RoundedCornerShape(4.dp),
                                    modifier = Modifier.padding(end = 6.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(6.dp)
                                                .background(Color.White, CircleShape)
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            text = "REC",
                                            color = Color.White,
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            Icon(
                                imageVector = Icons.Default.Security,
                                contentDescription = null,
                                tint = AccentGreen,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "MONITORED",
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Text(
                            text = "Inmate: ${inmateProfile?.let { "${it.firstName} ${it.lastName}" } ?: "User"} | $contactName",
                            color = Color.White.copy(alpha = 0.8f),
                            fontSize = 11.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    // Timer Chip
                    Surface(
                        color = Color.White.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            text = "${formatTime(timerSeconds)} / 05:00",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }

        // 4. NETWORK WARNING
        if (!isNetworkAvailable) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.Center)
                    .padding(horizontal = 24.dp)
                    .zIndex(4f),
                color = WarningOrange,
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Default.WifiOff, contentDescription = null, tint = Color.White)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Connection lost. Reconnecting...",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
            }
        }

        // 5. BOTTOM CONTROL BAR
        AnimatedVisibility(
            visible = controlsVisible,
            enter = fadeIn() + slideInVertically(initialOffsetY = { it / 2 }),
            exit = fadeOut() + slideOutVertically(targetOffsetY = { it / 2 }),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .zIndex(2f)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.95f))
                        )
                    )
                    .padding(bottom = 16.dp, start = 12.dp, end = 12.dp, top = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Surface(
                    color = AccentGreen,
                    shape = RoundedCornerShape(50)
                ) {
                    Text(
                        text = "Live Billing: â‚¹${String.format("%.2f", currentCost)}",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                    )
                }

                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(24.dp),
                    color = DarkControlsBg
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        VideoActionButton(
                            icon = if (isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                            label = if (isMuted) "Unmute" else "Mute",
                            isActive = isMuted,
                            activeColor = AlertRed,
                            onClick = {
                                onMuteToggle()
                                lastInteractionTime = System.currentTimeMillis()
                            }
                        )

                        VideoActionButton(
                            icon = if (!isCameraOn) Icons.Default.VideocamOff else Icons.Default.Videocam,
                            label = if (!isCameraOn) "Cam Off" else "Cam On",
                            isActive = !isCameraOn,
                            activeColor = AlertRed,
                            onClick = {
                                onVideoToggle()
                                lastInteractionTime = System.currentTimeMillis()
                            }
                        )

                        VideoActionButton(
                            icon = Icons.Default.FlipCameraAndroid,
                            label = "Flip",
                            isActive = false,
                            activeColor = PrimaryBlue,
                            onClick = {
                                onSwitchCamera()
                                lastInteractionTime = System.currentTimeMillis()
                            }
                        )

                        VideoActionButton(
                            icon = if (isSpeakerOn) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff,
                            label = "Speaker",
                            isActive = isSpeakerOn,
                            activeColor = PrimaryBlue,
                            onClick = {
                                onSpeakerToggle()
                                lastInteractionTime = System.currentTimeMillis()
                            }
                        )

                        VideoActionButton(
                            icon = Icons.Default.Info,
                            label = "Info",
                            isActive = showInfoDialog,
                            activeColor = PrimaryBlue,
                            onClick = {
                                showInfoDialog = true
                                lastInteractionTime = System.currentTimeMillis()
                            }
                        )

                        VideoActionButton(
                            icon = Icons.Default.CallEnd,
                            label = "End",
                            isActive = true,
                            activeColor = AlertRed,
                            isEndCall = true,
                            onClick = onEndCall
                        )
                    }
                }
            }
        }

        // 6. CALL INFO DIALOG
        if (showInfoDialog) {
            Dialog(onDismissRequest = { showInfoDialog = false }) {
                Card(
                    modifier = Modifier.fillMaxWidth(0.95f),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Call Information",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextDark
                            )
                            IconButton(
                                onClick = { showInfoDialog = false },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(Icons.Default.Close, contentDescription = "Close", tint = TextGray)
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFFF1F5F9), RoundedCornerShape(12.dp))
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Inmate:", fontSize = 12.sp, color = TextGray)
                                Text(inmateProfile?.let { "${it.firstName} ${it.lastName}" } ?: "Inmate", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextDark)
                            }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Contact:", fontSize = 12.sp, color = TextGray)
                                Text(contactName, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextDark)
                            }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Time Remaining:", fontSize = 12.sp, color = TextGray)
                                Text(formatTime(remainingSeconds), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = AlertRed)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun VideoActionButton(
    icon: ImageVector,
    label: String,
    isActive: Boolean,
    activeColor: Color,
    isEndCall: Boolean = false,
    onClick: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Surface(
            onClick = onClick,
            shape = CircleShape,
            color = if (isEndCall) AlertRed else if (isActive) activeColor else Color.White.copy(alpha = 0.15f),
            modifier = Modifier.size(42.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
        Spacer(modifier = Modifier.height(3.dp))
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.8f),
            fontSize = 9.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

// ============================================================================
// PREVIEWS FOR MOBILE & TABLET
// ============================================================================

/**
 * 1. MOBILE PREVIEW
 */
@Preview(
    name = "Mobile - Portrait Video Call",
    device = "spec:width=360dp,height=800dp,dpi=440",
    showBackground = true
)
@Composable
fun VideoCallContentMobilePreview() {
    PrisonKioskTheme {
        VideoCallContent(
            contactName = "Suresh Kumar",
            timerSeconds = 145,
            isMuted = false,
            isCameraOn = true,
            isSpeakerOn = true,
            callState = CallUIState.CONNECTED,
            isNetworkAvailable = true,
            isRecording = true,
            inmateProfile = InmateProfile(
                inmateId = "INM123",
                firstName = "Rahul",
                lastName = "Kumar",
                prisonId = "PRIS1",
                facility = "Central Jail",
                cellBlock = "Block A",
                status = InmateStatus.ACTIVE
            ),
            contactProfile = Contact(
                id = "CON1",
                fullName = "Suresh Kumar",
                phoneNumber = "+919876543210",
                relationship = "Father",
                approvalStatus = "approved"
            ),
            localTrack = null,
            remoteTrack = null,
            eglContext = null,
            onMuteToggle = {},
            onVideoToggle = {},
            onSpeakerToggle = {},
            onSwitchCamera = {},
            onEndCall = {}
        )
    }
}

/*
/**
 * 2. TABLET PREVIEW (Commented Out)
 * Uncomment this block when testing Kiosk / Large Tablet Screen layouts.
 */
@Preview(
    name = "Tablet - Landscape Video Call",
    device = "spec:width=1280dp,height=800dp,dpi=240",
    showBackground = true
)
@Composable
fun VideoCallContentTabletPreview() {
    PrisonKioskTheme {
        VideoCallContent(
            contactName = "Suresh Kumar",
            timerSeconds = 210,
            isMuted = true,
            isCameraOn = true,
            isSpeakerOn = true,
            callState = CallUIState.CONNECTED,
            isNetworkAvailable = true,
            isRecording = true,
            inmateProfile = InmateProfile(
                inmateId = "INM123",
                firstName = "Rahul",
                lastName = "Kumar",
                prisonId = "PRIS1",
                facility = "Central Jail",
                cellBlock = "Block A",
                status = InmateStatus.ACTIVE
            ),
            contactProfile = Contact(
                id = "CON1",
                fullName = "Suresh Kumar",
                phoneNumber = "+919876543210",
                relationship = "Father",
                approvalStatus = "approved"
            ),
            localTrack = null,
            remoteTrack = null,
            eglContext = null,
            onMuteToggle = {},
            onVideoToggle = {},
            onSpeakerToggle = {},
            onSwitchCamera = {},
            onEndCall = {}
        )
    }
}
*/
