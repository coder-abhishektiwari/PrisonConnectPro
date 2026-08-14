package com.prisonconnect.kiosk.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Outlined text field for the kiosk design system.
 */
@Composable
fun KioskTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: androidx.compose.ui.Modifier = Modifier,
    placeholder: String = "",
    enabled: Boolean = true,
    isError: Boolean = false,
    supportingText: String? = null
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp),
        enabled = enabled,
        isError = isError,
        label = { Text(label) },
        placeholder = { Text(placeholder) },
        supportingText = supportingText?.let { { Text(it) } },
        shape = MaterialTheme.shapes.medium
    )
}