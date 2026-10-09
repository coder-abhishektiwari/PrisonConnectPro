package com.prisonconnect.kiosk.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.prisonconnect.kiosk.R
import com.prisonconnect.kiosk.core.NetworkQualityMonitor
import com.prisonconnect.kiosk.ui.theme.PrimaryNavy
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme
import java.text.SimpleDateFormat
import java.util.*

/**
 * Per-bar strength colours: the bottom bar is red and the top bar green, so
 * the stack literally shifts red as quality decays and greens up when the
 * link recovers — full strength shows the classic red→green gradient.
 */
private val BAR_COLORS = listOf(
    Color(0xFFF44336), // bar 1 — red (weakest)
    Color(0xFFFF9800), // bar 2 — orange
    Color(0xFFFFC107), // bar 3 — amber
    Color(0xFF4CAF50)  // bar 4 — green (full)
)

/**
 * Four ascending signal bars. Bars at or below the current level light up
 * in their strength colour; the remaining bars stay dim — the icon loses
 * bars (and red-wards its colour) as the signal decays. Offline shows all
 * bars lit red.
 */
@Composable
private fun WifiStrengthBars(
    level: Int,
    online: Boolean,
    modifier: Modifier = Modifier,
    barCount: Int = 4
) {
    val inactiveColor = Color.White.copy(alpha = 0.35f)
    Canvas(modifier = modifier) {
        val barWidthPx = size.width / (barCount * 2f)
        val gapPx = barWidthPx
        val maxWidthPx = size.height
        val cornerPx = barWidthPx / 2f
        repeat(barCount) { i ->
            val barHeight = maxWidthPx * (i + 1) / barCount
            val x = i * (barWidthPx + gapPx)
            val lit = !online || i < level
            drawRoundRect(
                color = if (lit) BAR_COLORS.getOrElse(i) { BAR_COLORS.last() } else inactiveColor,
                topLeft = androidx.compose.ui.geometry.Offset(x, size.height - barHeight),
                size = Size(barWidthPx, barHeight),
                cornerRadius = CornerRadius(cornerPx, cornerPx)
            )
        }
    }
}

@Composable
fun KioskTopBar(
    modifier: Modifier = Modifier,
    showBackButton: Boolean = false,
    onBackClick: () -> Unit = {},
    title: String? = null,
    isOnline: Boolean = true
) {
    var currentTime by remember { mutableStateOf(Calendar.getInstance().time) }
    val timeFormat = remember { SimpleDateFormat("hh:mm a", Locale.getDefault()) }
    val dateFormat = remember { SimpleDateFormat("dd MMM yyyy", Locale.getDefault()) }

    LaunchedEffect(Unit) {
        while (true) {
            currentTime = Calendar.getInstance().time
            kotlinx.coroutines.delay(1000)
        }
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = PrimaryNavy,
        tonalElevation = 0.dp
    ) {
        BoxWithConstraints {
            val isCompact = maxWidth < 400.dp
            val horizontalPadding = if (isCompact) 12.dp else 24.dp
            val verticalPadding = if (isCompact) 10.dp else 16.dp
            val spaceBetweenLeftRight = if (isCompact) 8.dp else 16.dp

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = horizontalPadding, vertical = verticalPadding),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // --- Left Section: Back Button + Lock Icon + Title ---
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f, fill = false)
                ) {
                    if (showBackButton) {
                        IconButton(
                            onClick = onBackClick,
                            modifier = Modifier.size(if (isCompact) 32.dp else 40.dp)
                        ) {
                    Icon(
                        imageVector = Icons.Default.ArrowBack,
                        contentDescription = "Back",
                        tint = Color.White
                    )
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                    }
                    Icon(
                        imageVector = Icons.Default.Lock,
                        contentDescription = "Secure",
                        tint = Color.White,
                        modifier = Modifier.size(if (isCompact) 18.dp else 24.dp)
                    )
                    Spacer(modifier = Modifier.width(if (isCompact) 6.dp else 12.dp))
                    Text(
                        text = title ?: stringResource(R.string.secure_prison_kiosk),
                        style = if (isCompact) MaterialTheme.typography.titleSmall else MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(modifier = Modifier.width(spaceBetweenLeftRight))

                // --- Right Section: Live Wi-Fi Strength + Time & Date ---
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(if (isCompact) 8.dp else 16.dp)
                ) {
                    val quality by NetworkQualityMonitor.quality.collectAsState()
                    val barsSize = if (isCompact) 16.dp else 20.dp
                    WifiStrengthBars(
                        level = quality.level,
                        online = quality.online,
                        modifier = Modifier.size(barsSize)
                    )

                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = timeFormat.format(currentTime),
                            style = if (isCompact) {
                                MaterialTheme.typography.titleMedium.copy(fontSize = 14.sp)
                            } else {
                                MaterialTheme.typography.titleLarge
                            },
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            maxLines = 1,
                            softWrap = false
                        )
                        Text(
                            text = dateFormat.format(currentTime),
                            style = if (isCompact) {
                                MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp)
                            } else {
                                MaterialTheme.typography.labelMedium
                            },
                            color = Color.White.copy(alpha = 0.7f),
                            maxLines = 1,
                            softWrap = false
                        )
                    }
                }
            }
        }
    }
}

// --- Previews for both Compact (Mobile) and Large (Tablet) Screens ---

@Preview(name = "Mobile Frame", widthDp = 360, showBackground = true)
@Composable
fun PreviewKioskTopBarMobile() {
    PrisonKioskTheme {
        KioskTopBar()
    }
}

@Preview(name = "Tablet Frame", widthDp = 800, showBackground = true)
@Composable
fun PreviewKioskTopBarTablet() {
    PrisonKioskTheme {
        KioskTopBar()
    }
}
