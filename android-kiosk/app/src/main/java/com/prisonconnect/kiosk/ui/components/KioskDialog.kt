package com.prisonconnect.kiosk.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Reusable dialog for the kiosk design system.
 */
@Composable
fun KioskDialog(
    title: String,
    message: String,
    confirmText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    dismissText: String = "Cancel"
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall
            )
        },
        text = {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium
            )
        },
        confirmButton = {
            KioskButton(
                text = confirmText,
                onClick = onConfirm,
                modifier = Modifier.fillMaxWidth()
            )
        },
        dismissButton = {
            KioskSecondaryButton(
                text = dismissText,
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth()
            )
        }
    )
}