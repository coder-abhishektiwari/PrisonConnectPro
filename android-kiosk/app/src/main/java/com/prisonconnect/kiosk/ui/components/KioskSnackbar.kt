package com.prisonconnect.kiosk.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch

/**
 * Reusable snackbar host for the kiosk design system.
 */
@Composable
fun KioskSnackbarHost(
    hostState: SnackbarHostState = remember { SnackbarHostState() }
): SnackbarHostState {
    SnackbarHost(hostState) { data: SnackbarData ->
        Snackbar(
            snackbarData = data,
            shape = MaterialTheme.shapes.medium,
            containerColor = MaterialTheme.colorScheme.inverseSurface,
            contentColor = MaterialTheme.colorScheme.inverseOnSurface
        )
    }
    return hostState
}