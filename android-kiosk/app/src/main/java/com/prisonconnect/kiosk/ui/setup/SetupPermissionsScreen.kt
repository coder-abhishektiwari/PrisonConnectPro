package com.prisonconnect.kiosk.ui.setup

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.prisonconnect.kiosk.core.KioskPermissions
import com.prisonconnect.kiosk.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class PermissionRow(
    val title: String,
    val purpose: String,
    val icon: ImageVector,
    val permissions: List<String>
)

private val permissionRows: List<PermissionRow>
    get() {
        val notifications = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            listOf(android.Manifest.permission.POST_NOTIFICATIONS)
        } else {
            emptyList()
        }
        return listOf(
            PermissionRow(
                title = "Camera",
                purpose = "Video calls and the video half of the call recording",
                icon = Icons.Filled.Videocam,
                permissions = listOf(android.Manifest.permission.CAMERA)
            ),
            PermissionRow(
                title = "Microphone",
                purpose = "Two-way calls and the audio half of the call recording",
                icon = Icons.Filled.Mic,
                permissions = listOf(android.Manifest.permission.RECORD_AUDIO)
            ),
            PermissionRow(
                title = "Location",
                purpose = "Stored inside each recording's metadata as an audit trail",
                icon = Icons.Filled.Place,
                permissions = listOf(
                    android.Manifest.permission.ACCESS_FINE_LOCATION,
                    android.Manifest.permission.ACCESS_COARSE_LOCATION
                )
            ),
            PermissionRow(
                title = "Notifications",
                purpose = "Recording upload status on the kiosk",
                icon = Icons.Filled.Notifications,
                permissions = notifications
            )
        )
    }

/**
 * One-time setup step: collects every runtime permission the kiosk needs so
 * calls and recordings never show a system dialog mid-session.
 *
 * Device-owner kiosks are granted silently; everyone else gets a single batch
 * system prompt, with a direct jump to app settings as the fallback.
 */
@Composable
fun SetupPermissionsScreen(
    onGranted: () -> Unit,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    var missing by remember { mutableStateOf(KioskPermissions.missing(context)) }
    var busy by remember { mutableStateOf(false) }
    var promptShown by remember { mutableStateOf(false) }

    fun refresh() {
        missing = KioskPermissions.missing(context)
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        promptShown = true
        refresh()
    }

    fun openAppSettings() {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", context.packageName, null)
        )
        context.startActivity(intent)
    }

    fun grantAll() {
        if (busy) return
        busy = true
        scope.launch {
            if (KioskPermissions.isDeviceOwner(context)) {
                withContext(Dispatchers.Default) { KioskPermissions.grantViaDeviceOwner(context) }
                refresh()
                if (missing.isEmpty()) {
                    busy = false
                    return@launch
                }
            }
            busy = false
            if (missing.isNotEmpty()) {
                promptShown = true
                launcher.launch(missing.toTypedArray())
            }
        }
    }

    // Device owner: pre-grant before the operator ever touches the screen.
    LaunchedEffect(Unit) {
        if (KioskPermissions.isDeviceOwner(context) && missing.isNotEmpty()) {
            withContext(Dispatchers.Default) { KioskPermissions.grantViaDeviceOwner(context) }
            refresh()
        }
    }

    // Coming back from app settings should re-evaluate immediately.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) refresh()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(missing) {
        if (missing.isEmpty()) {
            delay(400)
            onGranted()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundLight)
    ) {
        if (onBack != null) {
            IconButton(
                onClick = onBack,
                modifier = Modifier.align(Alignment.TopStart).padding(8.dp)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = OnSurfaceVariantLight
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(56.dp))
            Icon(
                imageVector = Icons.Filled.Videocam,
                contentDescription = null,
                modifier = Modifier.size(56.dp),
                tint = PrimaryLight
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Setup Permissions",
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = OnBackgroundLight
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Collected once, right here — calls and recordings will never be interrupted by a permission prompt again.",
                fontSize = 14.sp,
                lineHeight = 20.sp,
                color = OnSurfaceVariantLight
            )
            Spacer(Modifier.height(24.dp))

            permissionRows.forEach { row ->
                PermissionCard(
                    row = row,
                    granted = row.permissions.all { KioskPermissions.isGranted(context, it) }
                )
                Spacer(Modifier.height(10.dp))
            }

            Spacer(Modifier.height(14.dp))

            if (missing.isNotEmpty()) {
                Button(
                    onClick = { grantAll() },
                    enabled = !busy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryLight)
                ) {
                    if (busy) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = OnPrimaryLight,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = "Grant permissions",
                            color = OnPrimaryLight,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                if (promptShown) {
                    Spacer(Modifier.height(4.dp))
                    TextButton(onClick = { openAppSettings() }) {
                        Text(
                            text = "Still blocked? Open app settings",
                            color = PrimaryLight,
                            fontSize = 14.sp
                        )
                    }
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.CheckCircle,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = PrimaryLight
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "All permissions granted",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = OnBackgroundLight
                    )
                }
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun PermissionCard(
    row: PermissionRow,
    granted: Boolean
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = SurfaceLight,
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineLight),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = row.icon,
                contentDescription = null,
                modifier = Modifier.size(26.dp),
                tint = if (granted) PrimaryLight else OnSurfaceVariantLight
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = row.title,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = OnSurfaceLight
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = row.purpose,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    color = OnSurfaceVariantLight
                )
            }
            Spacer(Modifier.width(10.dp))
            if (granted) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = "Granted",
                    modifier = Modifier.size(20.dp),
                    tint = PrimaryLight
                )
            } else {
                Text(
                    text = "Required",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = ErrorLight
                )
            }
        }
    }
}
