package com.prisonconnect.kiosk.ui.call

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** One row of the progress checklist. */
@Composable
private fun StageRow(label: String, state: StageState) {
    val (color, symbol) = when (state) {
        StageState.DONE -> Color(0xFF22C55E) to "✓"
        StageState.ACTIVE -> Color(0xFFF59E0B) to "•"
        StageState.PENDING -> Color(0xFF525252) to ""
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(34.dp)
                .background(color, CircleShape)
        ) {
            Text(symbol, color = Color.White, fontSize = 16.sp)
        }
        Spacer(Modifier.size(14.dp))
        Text(
            label,
            color = if (state == StageState.PENDING) Color(0xFF9CA3AF) else Color.White,
            fontSize = 18.sp
        )
    }
}

private enum class StageState { PENDING, ACTIVE, DONE }

@Composable
fun CallProgressScreen(
    contactName: String,
    roomId: String,
    isVideoCall: Boolean,
    onConnected: () -> Unit,
    onFailed: () -> Unit,
    onCancel: () -> Unit
) {
    val context = LocalContext.current
    val viewModel: CallViewModel = androidx.hilt.navigation.compose.hiltViewModel()
    val callState by viewModel.callState.collectAsState()
    val stage by viewModel.familyStage.collectAsState()

    var showFailure by remember { mutableStateOf(false) }
    var everConnected by remember { mutableStateOf(false) }
    // The engine is a Singleton: its callState may still be CONNECTED/FAILED
    // from a PREVIOUS session when this screen first composes. Navigation
    // must stay blocked until THIS screen has run initCall().
    var sessionStarted by remember { mutableStateOf(false) }

    // Start the call session the moment this screen appears.
    LaunchedEffect(roomId) {
        viewModel.initCall(context, roomId, isVideoCall)
        sessionStarted = true
    }

    // Navigate into the real call screen only once media is CONNECTED.
    LaunchedEffect(callState, sessionStarted) {
        if (!sessionStarted) return@LaunchedEffect
        when (callState) {
            CallUIState.CONNECTED -> {
                everConnected = true
                onConnected()
            }
            CallUIState.FAILED -> {
                showFailure = true
                kotlinx.coroutines.delay(1500)
                onFailed()
            }
            else -> {}
        }
    }

    val stages: List<Pair<String, StageState>> = run {
        val s = stage
        listOf(
            "Call link sent to $contactName" to StageState.DONE,
            "$contactName opened the link" to when {
                s.ordinal >= FamilyStage.LINK_OPENED.ordinal -> StageState.DONE
                else -> StageState.ACTIVE
            },
            "Device verified" to when {
                s.ordinal >= FamilyStage.OTP_VERIFIED.ordinal || s == FamilyStage.DEVICE_VERIFIED -> StageState.DONE
                s.ordinal >= FamilyStage.LINK_OPENED.ordinal -> StageState.ACTIVE
                else -> StageState.PENDING
            },
            "OTP verified" to when {
                s.ordinal >= FamilyStage.OTP_VERIFIED.ordinal -> StageState.DONE
                s.ordinal >= FamilyStage.DEVICE_VERIFIED.ordinal -> StageState.ACTIVE
                else -> StageState.PENDING
            },
            "Connecting call..." to when {
                callState == CallUIState.CONNECTED -> StageState.DONE
                s == FamilyStage.OTP_VERIFIED || callState == CallUIState.WAITING &&
                    s.ordinal >= FamilyStage.OTP_VERIFIED.ordinal -> StageState.ACTIVE
                else -> StageState.PENDING
            }
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF111827))
            .padding(24.dp)
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.align(Alignment.Center)
        ) {
            Text(
                text = if (showFailure) "Call Failed" else "Calling $contactName",
                color = if (showFailure) Color(0xFFEF4444) else Color.White,
                fontSize = 28.sp,
                style = MaterialTheme.typography.titleLarge
            )
            Spacer(Modifier.height(28.dp))
            stages.forEach { (label, state) -> StageRow(label, state) }
            Spacer(Modifier.height(36.dp))
            Button(
                onClick = {
                    viewModel.endCall()
                    onCancel()
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                modifier = Modifier.size(72.dp)
            ) {
                Icon(
                    Icons.Filled.CallEnd,
                    contentDescription = "End call",
                    tint = Color.White,
                    modifier = Modifier.size(32.dp)
                )
            }
            Spacer(Modifier.height(10.dp))
            Text("Cancel", color = Color(0xFF9CA3AF), fontSize = 14.sp)
        }
    }
}
