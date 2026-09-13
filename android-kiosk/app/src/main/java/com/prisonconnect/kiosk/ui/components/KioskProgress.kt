package com.prisonconnect.kiosk.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.dp
import com.prisonconnect.kiosk.ui.theme.PrimaryNavy

/**
 * Circular progress indicator for the kiosk design system.
 */
@Composable
fun KioskProgressIndicator(
    modifier: Modifier = Modifier
) {
    CircularProgressIndicator(
        modifier = modifier.size(48.dp),
        color = PrimaryNavy,
        trackColor = Color.Unspecified,
        strokeWidth = 4.dp,
        strokeCap = StrokeCap.Round
    )
}
