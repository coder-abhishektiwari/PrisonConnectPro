package com.prisonconnect.kiosk.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.R
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

private val PrimaryNavy = Color(0xFF003366)
private val LightNavy = Color(0xFF004080)
private val AccentGold = Color(0xFFFFC107)
private val TextWhiteAlpha = Color(0xB3FFFFFF)

@Composable
fun SplashScreen(
    onNavigateToRegistration: () -> Unit,
    onNavigateToLogin: () -> Unit,
    onNavigateToUnauthorized: () -> Unit,
    onNavigateToDashboard: () -> Unit,
    viewModel: SplashViewModel = hiltViewModel()
) {
    var startAnimation by remember { mutableStateOf(false) }
    val verificationState by viewModel.verificationState.collectAsState()

    val alphaAnim by animateFloatAsState(
        targetValue = if (startAnimation) 1f else 0f,
        animationSpec = tween(durationMillis = 1000),
        label = "AlphaAnim"
    )

    val scaleAnim by animateFloatAsState(
        targetValue = if (startAnimation) 1f else 0.85f,
        animationSpec = tween(durationMillis = 1000),
        label = "ScaleAnim"
    )

    LaunchedEffect(Unit) {
        startAnimation = true
        viewModel.navigationEvent.collect { event ->
            when (event) {
                is SplashViewModel.SplashNavigation.NavigateToRegistration -> onNavigateToRegistration()
                is SplashViewModel.SplashNavigation.NavigateToLogin -> onNavigateToLogin()
                is SplashViewModel.SplashNavigation.NavigateToUnauthorized -> onNavigateToUnauthorized()
                is SplashViewModel.SplashNavigation.NavigateToDashboard -> onNavigateToDashboard()
            }
        }
    }


    Box(modifier = Modifier.fillMaxSize()) {
        SplashContent(
            alpha = alphaAnim,
            scale = scaleAnim
        )

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
}

@Composable
fun SplashContent(
    alpha: Float,
    scale: Float
) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(PrimaryNavy)
    ) {
        val isTablet = maxWidth >= 600.dp
        val iconSize = if (isTablet) 120.dp else 80.dp
        val circleContainerSize = if (isTablet) 180.dp else 120.dp
        val titleFontSize = if (isTablet) 36.sp else 24.sp
        val subtitleFontSize = if (isTablet) 14.sp else 12.sp

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Top Spacer for vertical balance
            Spacer(modifier = Modifier.height(32.dp))

            // Center Content (Icon + Title + Subtitle)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .alpha(alpha)
                    .scale(scale)
            ) {
                // Outer Glow Circle for App Icon
                Surface(
                    modifier = Modifier.size(circleContainerSize),
                    shape = CircleShape,
                    color = LightNavy,
                    shadowElevation = 8.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = null,
                            modifier = Modifier.size(iconSize),
                            tint = Color.White
                        )
                    }
                }

                Spacer(modifier = Modifier.height(28.dp))

                Text(
                    text = stringResource(R.string.app_name).uppercase(),
                    fontSize = titleFontSize,
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    letterSpacing = if (isTablet) 4.sp else 2.sp,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Pill Tag Subtitle
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = Color.White.copy(alpha = 0.12f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.2f))
                ) {
                    Text(
                        text = stringResource(R.string.secure_communication_kiosk),
                        fontSize = subtitleFontSize,
                        color = TextWhiteAlpha,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                        textAlign = TextAlign.Center
                    )
                }
            }

            // Bottom Section (Loader + Security Badge)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .alpha(alpha)
                    .padding(bottom = 16.dp)
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(if (isTablet) 32.dp else 24.dp),
                    color = AccentGold,
                    strokeWidth = 2.5.dp
                )

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Lock,
                        contentDescription = null,
                        tint = TextWhiteAlpha,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = "Secured Prison Kiosk System",
                        fontSize = 11.sp,
                        color = TextWhiteAlpha,
                        fontWeight = FontWeight.Normal
                    )
                }
            }
        }
    }
}

// --- PREVIEWS ---

//@Preview(name = "Tablet View", device = "spec:width=1280dp,height=800dp,orientation=portrait", showBackground = true)
//@Composable
//fun PreviewSplashTablet() {
//    PrisonKioskTheme {
//        SplashContent(alpha = 1f, scale = 1f)
//    }
//}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewSplashMobile() {
    PrisonKioskTheme {
        SplashContent(alpha = 1f, scale = 1f)
    }
}
