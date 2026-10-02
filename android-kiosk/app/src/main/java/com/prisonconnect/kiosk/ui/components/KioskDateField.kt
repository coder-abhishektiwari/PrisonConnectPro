package com.prisonconnect.kiosk.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

private const val STORAGE_PATTERN = "yyyy-MM-dd"
private const val DISPLAY_PATTERN = "dd MMM yyyy"
private const val LEGACY_DISPLAY_PATTERN = "dd-MM-yyyy"
private const val LEGACY_INPUT_PATTERN = "yyyy-MM-dd HH:mm:ss"

private fun storageFormat(): SimpleDateFormat =
    SimpleDateFormat(STORAGE_PATTERN, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }

private fun millisOf(raw: String): Long? {
    val value = raw.trim()
    if (value.isEmpty()) return null
    listOf(STORAGE_PATTERN, LEGACY_DISPLAY_PATTERN, LEGACY_INPUT_PATTERN).forEach { pattern ->
        try {
            val sdf = SimpleDateFormat(pattern, Locale.US)
            sdf.isLenient = false
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            return sdf.parse(value)?.time
        } catch (_: Exception) {
        }
    }
    return null
}

private fun displayOf(raw: String): String {
    val millis = millisOf(raw) ?: return raw.trim()
    return SimpleDateFormat(DISPLAY_PATTERN, Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(Date(millis))
}

private fun storageOf(millis: Long): String =
    storageFormat().format(Date(millis))

/**
 * Date input that stores an ISO `yyyy-MM-dd` value but only lets the admin
 * pick the value from a Material date picker, so dates stay consistent.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KioskDateField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    required: Boolean = false,
    onClear: (() -> Unit)? = null
) {
    var showPicker by remember { mutableStateOf(false) }

    OutlinedTextField(
        value = displayOf(value),
        onValueChange = {},
        label = { Text(if (required) "$label *" else label) },
        readOnly = true,
        enabled = false,
        singleLine = true,
        trailingIcon = {
            Icon(Icons.Default.CalendarToday, contentDescription = "Pick $label")
        },
        colors = OutlinedTextFieldDefaults.colors(
            disabledTextColor = Color(0xFF0B2240),
            disabledBorderColor = Color(0xFFB0BEC5),
            disabledLabelColor = Color(0xFF687A8F),
            disabledTrailingIconColor = Color(0xFF003366)
        ),
        modifier = modifier
            .fillMaxWidth()
            .clickable { showPicker = true }
    )

    if (showPicker) {
        val initialMillis = millisOf(value) ?: System.currentTimeMillis()
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        pickerState.selectedDateMillis?.let { onValueChange(storageOf(it)) }
                        showPicker = false
                    }
                ) { Text("OK") }
            },
            dismissButton = {
                if (value.isNotBlank() || onClear != null) {
                    TextButton(
                        onClick = {
                            (onClear ?: { onValueChange("") })()
                            showPicker = false
                        }
                    ) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "Clear $label",
                            modifier = Modifier.padding(end = 4.dp)
                        )
                        Text("Clear")
                    }
                } else {
                    TextButton(onClick = { showPicker = false }) { Text("Cancel") }
                }
            }
        ) {
            DatePicker(state = pickerState, showModeToggle = false)
        }
    }
}
