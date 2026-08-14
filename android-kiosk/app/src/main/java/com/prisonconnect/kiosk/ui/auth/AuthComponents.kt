package com.prisonconnect.kiosk.ui.auth

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

// --- Premium Color Palette ---
val PremiumNavy = Color(0xFF001F3F)
val PremiumBlue = Color(0xFF003366)
val AppleGray = Color(0xFFF5F5F7)
val AccentBlue = Color(0xFF0071E3)
val SuccessGreen = Color(0xFF28A745)
val ErrorRed = Color(0xFFD70015)

@Composable
fun PremiumAuthCard(
    title: String,
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isPressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (isPressed) 0.95f else 1f, label = "Scale")

    Surface(
        modifier = modifier
            .scale(scale)
            .clip(RoundedCornerShape(28.dp))
            .clickable { onClick() },
        color = Color.White,
        shadowElevation = 8.dp
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            colors = listOf(PremiumBlue, PremiumNavy)
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(40.dp)
                )
            }
            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = title,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = PremiumNavy
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = description,
                fontSize = 14.sp,
                color = Color.Gray,
                textAlign = TextAlign.Center,
                lineHeight = 20.sp
            )
        }
    }
}

@Composable
fun IPhoneKeypad(
    onNumberClick: (String) -> Unit,
    onDeleteClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val numbers = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("", "0", "DEL")
    )

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        numbers.forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                row.forEach { item ->
                    if (item.isEmpty()) {
                        Spacer(modifier = Modifier.size(72.dp))
                    } else {
                        KeypadButton(
                            text = item,
                            onClick = {
                                if (item == "DEL") onDeleteClick() else onNumberClick(item)
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun KeypadButton(
    text: String,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .size(72.dp)
            .clip(CircleShape)
            .clickable { onClick() },
        color = AppleGray,
        tonalElevation = 2.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (text == "DEL") {
                Icon(Icons.AutoMirrored.Filled.Backspace, contentDescription = null, tint = PremiumNavy)
            } else {
                Text(
                    text = text,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Medium,
                    color = PremiumNavy
                )
            }
        }
    }
}

@Composable
fun ScanningDialog(
    type: String,
    status: ScanningStatus,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.85f)),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                ScanningVisual(type, status)
                Spacer(modifier = Modifier.height(40.dp))
                Text(
                    text = when (status) {
                        ScanningStatus.SCANNING -> "Scanning $type..."
                        ScanningStatus.SUCCESS -> "Verified Successfully"
                        ScanningStatus.ERROR -> "Scan Failed. Try again."
                    },
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
                if (status == ScanningStatus.ERROR) {
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(
                        onClick = onDismiss,
                        colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("CANCEL", color = Color.Black, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun ScanningVisual(type: String, status: ScanningStatus) {
    val infiniteTransition = rememberInfiniteTransition(label = "Scanning")
    val pulse by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "Pulse"
    )

    val icon = when (type) {
        "Fingerprint" -> Icons.Default.Fingerprint
        "Face ID" -> Icons.Default.Face
        else -> Icons.Default.CreditCard
    }

    val color = when (status) {
        ScanningStatus.SCANNING -> AccentBlue
        ScanningStatus.SUCCESS -> SuccessGreen
        ScanningStatus.ERROR -> ErrorRed
    }

    Box(contentAlignment = Alignment.Center) {
        if (status == ScanningStatus.SCANNING) {
            Box(
                modifier = Modifier
                    .size(120.dp)
                    .scale(pulse)
                    .border(2.dp, color.copy(alpha = 0.5f), CircleShape)
            )
        }

        Surface(
            modifier = Modifier.size(120.dp),
            shape = CircleShape,
            color = color,
            shadowElevation = 12.dp
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = if (status == ScanningStatus.SUCCESS) Icons.Default.Check else icon,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(60.dp)
                )
            }
        }
    }
}

enum class ScanningStatus {
    SCANNING, SUCCESS, ERROR
}

@Composable
fun PremiumLoadingOverlay(message: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.4f))
            .clickable(enabled = false) {},
        contentAlignment = Alignment.Center
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = Color.White.copy(alpha = 0.95f),
            tonalElevation = 8.dp,
            modifier = Modifier.size(200.dp)
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(24.dp)
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(56.dp),
                    color = PremiumBlue,
                    strokeWidth = 4.dp
                )
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = message,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = PremiumNavy,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}
