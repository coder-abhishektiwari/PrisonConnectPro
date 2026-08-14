package com.prisonconnect.kiosk.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Reusable modal bottom sheet for the kiosk design system.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KioskBottomSheet(
    onDismiss: () -> Unit,
    title: String,
    content: @Composable () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        shape = MaterialTheme.shapes.large
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 16.dp)
        )
        content()
    }
}