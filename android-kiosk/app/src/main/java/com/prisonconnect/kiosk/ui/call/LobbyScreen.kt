package com.prisonconnect.kiosk.ui.call

import android.R
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.*
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.ui.theme.BorderColor
import com.prisonconnect.kiosk.ui.theme.LightBg
import com.prisonconnect.kiosk.ui.theme.PrimaryDarkNavy
import com.prisonconnect.kiosk.ui.theme.PrimaryNavy
import com.prisonconnect.kiosk.ui.theme.TextGray
import com.prisonconnect.kiosk.ui.theme.White

@Composable
fun CallLobbyDialog(
    contactId: String,
    contactName: String,
    callType: String = "Video",
    scheduleId: String = "",
    onDismiss: () -> Unit,
    onSchedule: (contactId: String, contactName: String) -> Unit,
    onStartCall: (contactId: String, contactName: String, roomId: String, isVideo: Boolean) -> Unit,
    viewModel: RoomViewModel = hiltViewModel()
) {
    val balance by viewModel.balance.collectAsState()
    val maxDurationMinutes by viewModel.maxDurationMinutes.collectAsState()
    val createRoomState by viewModel.createRoomState.collectAsState()
    val isVideo = callType.equals("Video", ignoreCase = true)
    val ratePerMin = if (isVideo) 2 else 1
    val isSufficient = balance >= ratePerMin

    LaunchedEffect(contactId) {
        viewModel.loadBalance()
        viewModel.loadMaxDuration()
        viewModel.consumeCreateRoomNavigation()
    }

    LaunchedEffect(createRoomState) {
        val s = createRoomState
        if (s is UiState.Success) {
            val session = s.data
            onStartCall(contactId, contactName, session.sessionId, isVideo)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(24.dp),
        containerColor = Color.White,
        title = {
            Column {
                Text(
                    text = contactName,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = PrimaryDarkNavy
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = if (isVideo) "Video calls ₹2/min, Max duration $maxDurationMinutes min"
                    else "Audio calls ₹1/min, Max duration $maxDurationMinutes min",
                    fontSize = 12.sp,
                    color = TextGray
                )
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = if (isSufficient) Color(0xFF2E7D32) else Color(0xFFC62828),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Wallet Balance",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White
                        )
                        Text(
                            text = "₹${String.format("%.2f", balance)}",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White
                        )
                    }
                }

                HorizontalDivider(color = BorderColor)

                val isCreatingRoom = createRoomState is UiState.Loading

                Button(
                    onClick = { onSchedule(contactId, contactName) },
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = PrimaryNavy),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, PrimaryNavy)
                ) {
                    Icon(Icons.Default.DateRange, contentDescription = null, tint = PrimaryNavy)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isVideo) "Schedule Video Call" else "Schedule Audio Call",
                        fontWeight = FontWeight.Bold, fontSize = 14.sp
                    )
                }

                if (isVideo) {
                    Button(
                        onClick = { viewModel.createRoom(contactId, "Video", scheduleId.ifBlank { null }) },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy),
                        enabled = !isCreatingRoom && isSufficient
                    ) {
                        if (isCreatingRoom) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Videocam, contentDescription = null, tint = Color.White)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Video Call", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color.White)
                    }
                } else {
                    Button(
                        onClick = { viewModel.createRoom(contactId, "Audio", scheduleId.ifBlank { null }) },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy),
                        enabled = !isCreatingRoom && isSufficient
                    ) {
                        if (isCreatingRoom) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Call, contentDescription = null, tint = Color.White)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Audio Call", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color.White)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {}
    )
}
