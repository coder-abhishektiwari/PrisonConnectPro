package com.prisonconnect.kiosk.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.BackHandler
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

private val Black = Color(0xFF000000)
private val Red = Color(0xFFFF0000)
private val White = Color(0xFFFFFFFF)

@Composable
fun UnauthorizedDeviceScreen() {
    // Disable back button navigation on this screen
    BackHandler(enabled = true) {
        // Do nothing - effectively blocking the back button
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Black),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(32.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = null,
                tint = Red,
                modifier = Modifier.size(80.dp)
            )

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "THIS DEVICE IS NOT AUTHORISED",
                color = Red,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                letterSpacing = 2.sp
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "This kiosk is not registered or authorised\nto access the PrisonConnect system.",
                color = White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                lineHeight = 24.sp
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
fun PreviewUnauthorizedDeviceScreen() {
    PrisonKioskTheme {
        UnauthorizedDeviceScreen()
    }
}
