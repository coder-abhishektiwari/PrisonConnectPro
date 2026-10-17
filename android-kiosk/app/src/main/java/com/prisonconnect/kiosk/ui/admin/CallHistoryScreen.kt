package com.prisonconnect.kiosk.ui.admin

import android.media.MediaPlayer
import android.net.Uri
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
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

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

    // The player opens immediately; the vault decrypts behind it and its
    // real percentage rides the seek bar as a light-gray buffer line.
    state.playback?.let { playback ->
        RecordingPlaybackDialog(
            title = playback.title,
            fileUri = playback.file?.let(Uri::fromFile),
            decrypting = playback.decrypting,
            decryptProgress = state.playbackProgress,
            isAudio = playback.isAudio,
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
                    isPreparing = state.preparingCallId == call.callId,
                    prepareProgress = state.playbackProgress,
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
    isPreparing: Boolean,
    prepareProgress: Float,
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
                if (hasRecording && isPreparing) {
                    Button(
                        onClick = {},
                        enabled = false,
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF2E7D32),
                            disabledContainerColor = Color(0xFF2E7D32)
                        ),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Text(
                            text = "Preparing… ${(prepareProgress * 100).roundToInt()}%",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                } else if (hasRecording) {
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

            // Real decrypt percentage under the row while the vault works.
            if (isPreparing) {
                Spacer(Modifier.height(2.dp))
                LinearProgressIndicator(
                    progress = { prepareProgress.coerceIn(0f, 1f) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp),
                    color = Color(0xFF2E7D32),
                    trackColor = Color(0xFFE3E8EC)
                )
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

/** `0:00` / `12:34` / `1:02:03` — player time labels, locale-stable digits. */
private fun formatMs(ms: Long): String {
    if (ms <= 0L) return "0:00"
    val totalSec = ms / 1000
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) {
        String.format(Locale.ENGLISH, "%d:%02d:%02d", h, m, s)
    } else {
        String.format(Locale.ENGLISH, "%d:%02d", m, s)
    }
}

@Composable
private fun RecordingPlaybackDialog(
    title: String,
    fileUri: Uri?,
    decrypting: Boolean,
    decryptProgress: Float,
    isAudio: Boolean,
    onDismiss: () -> Unit
) {
    // Player lifecycle flags, keyed to the file so a replay starts clean:
    // ready = MediaPlayer prepared, buffering = mid-stream stall,
    // failed = decoder rejected the file (corrupt / unsupported).
    val ready = remember(fileUri) { mutableStateOf(false) }
    val buffering = remember(fileUri) { mutableStateOf(false) }
    val failed = remember(fileUri) { mutableStateOf(false) }
    // VideoView reference + transport state for the custom controls.
    val videoViewRef = remember(fileUri) { mutableStateOf<VideoView?>(null) }
    val isPlaying = remember(fileUri) { mutableStateOf(false) }
    val positionMs = remember(fileUri) { mutableStateOf(0L) }
    val durationMs = remember(fileUri) { mutableStateOf(0L) }
    val seeking = remember(fileUri) { mutableStateOf(false) }

    // Light poll instead of listener bookkeeping: VideoView exposes
    // position/duration/isPlaying directly, and the dialog only lives while
    // playback is on screen. Skipped mid-drag so the seek bar never fights
    // the admin's finger.
    LaunchedEffect(fileUri) {
        while (true) {
            videoViewRef.value?.let { v ->
                val dur = v.duration
                if (dur > 0) durationMs.value = dur.toLong()
                if (!seeking.value) positionMs.value = v.currentPosition.toLong()
                isPlaying.value = v.isPlaying
            }
            delay(500)
        }
    }

    fun togglePlay() {
        val v = videoViewRef.value ?: return
        if (v.isPlaying) {
            v.pause()
            isPlaying.value = false
        } else {
            // Completed → Play starts over instead of instantly re-finishing.
            if (durationMs.value > 0 && positionMs.value >= durationMs.value - 200) {
                v.seekTo(0)
                positionMs.value = 0
            }
            v.start()
            isPlaying.value = true
        }
    }

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
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                ) {
                    // The vault copy decrypts in the background — the video
                    // surface is created the moment the plain file is ready.
                    if (fileUri != null) {
                        key(fileUri) {
                            AndroidView(
                                factory = { ctx ->
                                    VideoView(ctx).apply {
                                        videoViewRef.value = this
                                        setVideoURI(fileUri)
                                        setOnPreparedListener { mp ->
                                            durationMs.value = mp.duration.toLong()
                                            start()
                                            isPlaying.value = true
                                            ready.value = true
                                        }
                                        setOnInfoListener { _, what, _ ->
                                            buffering.value = what == MediaPlayer.MEDIA_INFO_BUFFERING_START
                                            true
                                        }
                                        setOnErrorListener { _, _, _ ->
                                            failed.value = true
                                            buffering.value = false
                                            ready.value = true
                                            isPlaying.value = false
                                            true
                                        }
                                        setOnCompletionListener { isPlaying.value = false }
                                        setOnClickListener { togglePlay() }
                                    }
                                },
                                onRelease = { it.stopPlayback() },
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                    }

                    // Audio-only recordings render a black surface — give them
                    // a face. Touch passes through to the VideoView below.
                    if (isAudio && !failed.value) {
                        Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = null,
                            tint = Color(0x664CAF50),
                            modifier = Modifier
                                .size(96.dp)
                                .align(Alignment.Center)
                        )
                    }

                    // Static messages only — local files expose no prepare /
                    // buffer percentage, so no spinner; the seek bar's gray
                    // line below carries the real decrypt percentage instead.
                    when {
                        failed.value -> Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Icon(
                                Icons.Default.Error,
                                contentDescription = null,
                                tint = Color(0xFFEF5350),
                                modifier = Modifier.size(36.dp)
                            )
                            Spacer(Modifier.height(10.dp))
                            Text(
                                text = "Couldn't play this recording",
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center
                            )
                        }
                        decrypting -> Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "Preparing… ${(decryptProgress * 100).roundToInt()}%",
                                color = Color.White,
                                fontSize = 14.sp
                            )
                        }
                        !ready.value -> Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("Loading recording…", color = Color.White, fontSize = 14.sp)
                        }
                        buffering.value -> Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = Color(0xCC000000)
                            ) {
                                Text(
                                    text = "Buffering…",
                                    color = Color.White,
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                                )
                            }
                        }
                    }
                }

                // ---- Transport controls (always on screen, touch-sized) ----
                val dur = durationMs.value
                val pos = if (dur > 0) positionMs.value.coerceAtMost(dur) else positionMs.value
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { togglePlay() }, enabled = ready.value && !failed.value) {
                        Icon(
                            imageVector = if (isPlaying.value) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying.value) "Pause" else "Play",
                            tint = Color.White,
                            modifier = Modifier.size(30.dp)
                        )
                    }
                    Text(
                        text = formatMs(pos),
                        color = Color(0xFFB0BEC5),
                        fontSize = 11.sp,
                        modifier = Modifier.widthIn(min = 46.dp)
                    )
                    // YouTube-style: a light-gray line rides the real seek
                    // bar — decrypt % while the copy prepares, an
                    // indeterminate sweep while the player buffers mid-play.
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 8.dp)
                    ) {
                        Slider(
                            value = pos.toFloat(),
                            onValueChange = {
                                seeking.value = true
                                positionMs.value = it.toLong()
                            },
                            onValueChangeFinished = {
                                videoViewRef.value?.seekTo(positionMs.value.toInt())
                                seeking.value = false
                            },
                            enabled = ready.value && !failed.value && dur > 0,
                            valueRange = 0f..(if (dur > 0) dur else 1L).toFloat(),
                            modifier = Modifier.fillMaxWidth(),
                            colors = SliderDefaults.colors(
                                thumbColor = Color(0xFF4CAF50),
                                activeTrackColor = Color(0xFF4CAF50),
                                inactiveTrackColor = Color(0xFF3A3A3A),
                                disabledThumbColor = Color.Transparent,
                                disabledActiveTrackColor = Color(0xFF3A3A3A),
                                disabledInactiveTrackColor = Color(0xFF3A3A3A)
                            )
                        )
                        when {
                            decrypting -> LinearProgressIndicator(
                                progress = { decryptProgress.coerceIn(0f, 1f) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .align(Alignment.Center)
                                    .height(6.dp),
                                color = Color(0xFFBDBDBD),
                                trackColor = Color.Transparent
                            )
                            buffering.value && ready.value && !failed.value ->
                                LinearProgressIndicator(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .align(Alignment.Center)
                                        .height(6.dp),
                                    color = Color(0xFFBDBDBD),
                                    trackColor = Color.Transparent
                                )
                        }
                    }
                    Text(
                        text = formatMs(dur),
                        color = Color(0xFFB0BEC5),
                        fontSize = 11.sp,
                        textAlign = TextAlign.End,
                        modifier = Modifier.widthIn(min = 46.dp)
                    )
                }
                Spacer(Modifier.height(6.dp))
            }
        }
    }
}
