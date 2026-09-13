package com.prisonconnect.kiosk.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.R
import com.prisonconnect.kiosk.ui.theme.PrimaryNavy
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

@Composable
fun SplashScreen(
    onNavigateToRegistration: () -> Unit,
    onNavigateToLogin: () -> Unit,
    onNavigateToUnauthorized: () -> Unit,
    onNavigateToDashboard: () -> Unit,
    viewModel: SplashViewModel = hiltViewModel()
) {
    val verificationState by viewModel.verificationState.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.navigationEvent.collect { event ->
            when (event) {
                is SplashViewModel.SplashNavigation.NavigateToRegistration -> onNavigateToRegistration()
                is SplashViewModel.SplashNavigation.NavigateToLogin -> onNavigateToLogin()
                is SplashViewModel.SplashNavigation.NavigateToUnauthorized -> onNavigateToUnauthorized()
                is SplashViewModel.SplashNavigation.NavigateToDashboard -> onNavigateToDashboard()
            }
        }
    }

    Box(
        modifier = Modifier.fillMaxSize().background(Color.White),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_logo),
            contentDescription = "PrisonConnect Logo",
            modifier = Modifier.size(180.dp),
            contentScale = ContentScale.Fit
        )
    }

    if (verificationState is SplashViewModel.KioskVerificationState.VerificationError) {
        val errorState = verificationState as SplashViewModel.KioskVerificationState.VerificationError
        AlertDialog(
            onDismissRequest = {},
            title = {
                Text(
                    text = "Device Verification Error",
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 20.sp
                )
            },
            text = {
                Text(
                    text = errorState.message,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 15.sp,
                    lineHeight = 20.sp
                )
            },
            confirmButton = {
                if (errorState.isTransient) {
                    Button(
                        onClick = { viewModel.startVerification() },
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Retry", color = Color.White)
                    }
                }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(16.dp)
        )
    }
}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewSplashMobile() {
    PrisonKioskTheme {
        Box(
            modifier = Modifier.fillMaxSize().background(Color.White),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_logo),
                contentDescription = "Logo",
                modifier = Modifier.size(180.dp),
                contentScale = ContentScale.Fit
            )
        }
    }
}
