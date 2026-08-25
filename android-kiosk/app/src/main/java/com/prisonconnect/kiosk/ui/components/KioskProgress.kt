package com.prisonconnect.kiosk.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Home header navy — the app's primary accent. */
private val HeaderBlue = Color(0xFF003366)

/**
 * Circular progress indicator for the kiosk design system.
 * Plain spinner only — no surrounding track ring — in header blue.
 */
@Composable
fun KioskProgressIndicator(
    modifier: androidx.compose.ui.Modifier = Modifier
) {
    CircularProgressIndicator(
        modifier = modifier.size(48.dp),
        color = HeaderBlue,
        trackColor = Color.Transparent,
        strokeWidth = 4.dp
    )
}

/**
 * Linear progress indicator for the kiosk design system.
 */
@Composable
fun KioskLinearProgress(
    progress: Float? = null,
    modifier: androidx.compose.ui.Modifier = Modifier
) {
    if (progress != null) {
        LinearProgressIndicator(
            progress = progress,
            modifier = modifier,
            color = HeaderBlue,
            trackColor = Color.Transparent
        )
    } else {
        LinearProgressIndicator(
            modifier = modifier,
            color = HeaderBlue,
            trackColor = Color.Transparent
        )
    }
}

/**
 * Full-screen loading state for the kiosk design system.
 */
@Composable
fun KioskLoadingScreen() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        KioskProgressIndicator()
    }
}