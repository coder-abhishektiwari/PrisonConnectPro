package com.prisonconnect.kiosk.ui.admin

import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.models.call.CallHistory
import com.prisonconnect.kiosk.models.call.CallType
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DISPLAY_TIME: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a", Locale.ENGLISH)

@Composable
fun CallHistoryScreen(
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    viewModel: CallHistoryViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.playbackError) {
        state.playbackError?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearPlaybackError()
        }
    }

    state.playback?.let { playback ->
        RecordingPlaybackDialog(
            title = playback.title,
            fileUri = Uri.fromFile(playback.file),
            onDismiss = viewModel::dismissPlayback
        )
    }

    CallHistoryContent(
        state = state,
        snackbarHostState = snackbarHostState,
        onBackClick = onBackClick,
        onSearchChange = viewModel::onSearchChange,
        onTypeFilter = viewModel::setTypeFilter,
        onDatePreset = viewModel::setDatePreset,
        onToggleRecordedOnly = viewModel::toggleRecordedOnly,
        onRetry = viewModel::retry,
        onPlay = viewModel::startPlayback
    )
}

@Composable
fun CallHistoryContent(
    state: CallHistoryViewModel.UiState,
    snackbarHostState: SnackbarHostState,
    onBackClick: () -> Unit,
    onSearchChange: (String) -> Unit,
    onTypeFilter: (CallHistoryViewModel.TypeFilter) -> Unit,
    onDatePreset: (CallHistoryViewModel.DatePreset) -> Unit,
    onToggleRecordedOnly: () -> Unit,
    onRetry: () -> Unit,
    onPlay: (CallHistory) -> Unit
) {
    fun hasLocal(call: CallHistory): Boolean =
        call.callId in state.localCallIds ||
            (call.roomId?.let { it in state.localCallIds } == true)

    val visibleCalls = if (state.recordedOnly) state.calls.filter { hasLocal(it) } else state.calls
    val recordedCount = state.calls.count { hasLocal(it) }

    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Call History",
                showBackButton = true,
                onBackClick = onBackClick
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // ---- Filters ----
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(2.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        OutlinedTextField(
                            value = state.search,
                            onValueChange = onSearchChange,
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("Search inmate or family member") },
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                            trailingIcon = {
                                if (state.search.isNotEmpty()) {
                                    IconButton(onClick = { onSearchChange("") }) {
                                        Icon(Icons.Default.Close, contentDescription = "Clear search")
                                    }
                                }
                            },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp)
                        )

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            CallHistoryViewModel.TypeFilter.entries.forEach { filter ->
                                FilterChip(
                                    selected = state.typeFilter == filter,
                                    onClick = { onTypeFilter(filter) },
                                    label = { Text(filter.label, fontSize = 13.sp) }
                                )
                            }
                        }

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            CallHistoryViewModel.DatePreset.entries.forEach { preset ->
                                FilterChip(
                                    selected = state.datePreset == preset,
                                    onClick = { onDatePreset(preset) },
                                    label = { Text(preset.label, fontSize = 13.sp) }
                                )
                            }
                            FilterChip(
                                selected = state.recordedOnly,
                                onClick = onToggleRecordedOnly,
                                label = { Text("With recording", fontSize = 13.sp) },
                                leadingIcon = {
                                    Icon(
                                        Icons.Default.FilterList,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            )
                        }
                    }
                }
            }

            // ---- Summary ----
            item {
                Text(
                    text = if (state.total > 0) {
                        "${state.total} call${if (state.total == 1) "" else "s"}  ·  $recordedCount with recordings on this kiosk"
                    } else {
                        "$recordedCount recording${if (recordedCount == 1) "" else "s"} on this kiosk"
                    },
                    fontSize = 13.sp,
                    color = Color(0xFF687A8F),
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
            }

            // ---- Error ----
            if (state.error != null && !state.isLoading) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE))
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(Icons.Default.Error, contentDescription = null, tint = Color(0xFFD32F2F))
                            Text(
                                text = state.error,
                                fontSize = 14.sp,
                                color = Color(0xFFB71C1C),
                                modifier = Modifier.weight(1f)
                            )
                            TextButton(onClick = onRetry) {
                                Icon(Icons.Default.Refresh, contentDescription = null)
                                Spacer(Modifier.width(4.dp))
                                Text("Retry")
                            }
                        }
                    }
                }
            }

            // ---- Loading ----
            if (state.isLoading) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 24.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(12.dp))
                        Text("Loading calls…", fontSize = 14.sp, color = Color(0xFF687A8F))
                    }
                }
            }

            // ---- Empty ----
            if (!state.isLoading && state.error == null && visibleCalls.isEmpty()) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 40.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            Icons.Default.History,
                            contentDescription = null,
                            tint = Color(0xFFB0BEC5),
                            modifier = Modifier.size(48.dp)
                        )
                        Text(
                            text = if (state.recordedOnly) "No recordings match these filters" else "No calls match these filters",
                            fontSize = 15.sp,
                            color = Color(0xFF687A8F),
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            // ---- Call list ----
            items(visibleCalls, key = { it.callId }) { call ->
                CallHistoryCard(
                    call = call,
                    hasRecording = hasLocal(call),
                    onPlay = { onPlay(call) }
                )
            }

            item { Spacer(Modifier.height(8.dp)) }
        }
    }
}

@Composable
private fun CallHistoryCard(
    call: CallHistory,
    hasRecording: Boolean,
    onPlay: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = CircleShape,
                    color = if (call.type == CallType.AUDIO) Color(0xFF8E24AA) else Color(0xFF003366),
                    modifier = Modifier.size(40.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (call.type == CallType.AUDIO) Icons.Default.Mic else Icons.Default.Videocam,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "${call.inmateName ?: "Inmate"}  →  ${call.contactName ?: "Family"}",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0B2240),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = formatTime(call.startTime),
                        fontSize = 12.sp,
                        color = Color(0xFF687A8F),
                        maxLines = 1
                    )
                }
                StatusChip(status = call.status)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${call.type?.name?.lowercase()?.replaceFirstChar { it.uppercase() } ?: "Call"}" +
                        (call.durationMinutes?.let { "  ·  ${it} min" } ?: ""),
                    fontSize = 13.sp,
                    color = Color(0xFF687A8F),
                    modifier = Modifier.weight(1f)
                )
                if (hasRecording) {
                    Button(
                        onClick = onPlay,
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Play", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                } else {
                    Text(
                        text = "No recording",
                        fontSize = 12.sp,
                        color = Color(0xFFB0BEC5)
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusChip(status: String?) {
    val (bg, fg, label) = when (status?.lowercase()) {
        "completed" -> Triple(Color(0xFFE8F5E9), Color(0xFF2E7D32), "Completed")
        "active" -> Triple(Color(0xFFE3F2FD), Color(0xFF1565C0), "Active")
        "failed", "missed", "rejected", "cancelled" ->
            Triple(Color(0xFFFFEBEE), Color(0xFFC62828), status.replaceFirstChar { it.uppercase() })
        else -> Triple(
            Color(0xFFEEF2F7),
            Color(0xFF687A8F),
            status?.replaceFirstChar { it.uppercase() } ?: "Unknown"
        )
    }
    Surface(shape = RoundedCornerShape(8.dp), color = bg) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = fg,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        )
    }
}

private fun formatTime(iso: String?): String {
    if (iso.isNullOrBlank()) return "Unknown time"
    return try {
        Instant.parse(iso).atZone(ZoneId.systemDefault()).format(DISPLAY_TIME)
    } catch (_: Throwable) {
        iso
    }
}

@Composable
private fun RecordingPlaybackDialog(
    title: String,
    fileUri: Uri,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            shape = RoundedCornerShape(16.dp),
            color = Color(0xFF0B0B0B)
        ) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.PlayCircle, contentDescription = null, tint = Color(0xFF4CAF50))
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = title,
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White)
                    }
                }
                AndroidView(
                    factory = { ctx ->
                        VideoView(ctx).apply {
                            setVideoURI(fileUri)
                            val controller = MediaController(ctx)
                            controller.setAnchorView(this)
                            setMediaController(controller)
                            setOnPreparedListener { start() }
                        }
                    },
                    onRelease = { it.stopPlayback() },
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}
