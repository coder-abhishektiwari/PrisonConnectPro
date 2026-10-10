package com.prisonconnect.kiosk.ui.auth

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.LottieConstants
import com.airbnb.lottie.compose.rememberLottieComposition

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

/**
 * Strict 10-digit RFID card-number entry: dot indicator + on-screen numeric
 * keypad, same interaction as the Prisoner ID entry. Digits cap at 10 —
 * callers auto-submit when [onDigitsChange] reports a full number.
 */
@Composable
fun RfidKeypadEntry(
    digits: String,
    onDigitsChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            repeat(10) { index ->
                val filled = digits.length > index
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(if (filled) PremiumNavy else Color.LightGray.copy(alpha = 0.5f))
                        .border(1.dp, if (filled) PremiumNavy else Color.Gray, CircleShape)
                )
            }
        }

        IPhoneKeypad(
            onNumberClick = {
                if (digits.length < 10) onDigitsChange(digits + it)
            },
            onDeleteClick = {
                if (digits.isNotEmpty()) onDigitsChange(digits.dropLast(1))
            }
        )
    }
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

/**
 * Looping "tap your card on the reader" animation used on the RFID login
 * screen and the RFID registration dialog.
 * Source: assets/animations/rfid_card_tap_animation.json
 */
@Composable
fun RfidTapAnimation(modifier: Modifier = Modifier) {
    val composition by rememberLottieComposition(
        LottieCompositionSpec.Asset("animations/rfid_card_tap_animation.json")
    )
    LottieAnimation(
        composition = composition,
        modifier = modifier,
        iterations = LottieConstants.IterateForever
    )
}

/**
 * Invisible keyboard-wedge input for USB RFID readers (HID mode).
 *
 * The reader types the card number and then sends Enter. This field is kept
 * auto-focused and pinned to the back of the z-order (1dp, transparent text),
 * so every keystroke lands here without the user seeing anything.
 * [onCardDetected] fires as soon as Enter arrives (or automatically once
 * [cardLength] digits are collected) and the buffer resets for the next tap.
 *
 * Pass [enabled] = false while a dialog owns the screen; focus returns to
 * this field automatically when it is enabled again.
 */
@Composable
fun HiddenRfidTapInput(
    cardLength: Int = 10,
    enabled: Boolean = true,
    onCardDetected: (String) -> Unit
) {
    var digits by remember { mutableStateOf("") }
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    // Bumped whenever focus is lost so the field can steal it back —
    // kiosk screens have no other text input, so nothing competes for it.
    var refocusTick by remember { mutableStateOf(0) }

    fun submit(buffered: String? = null) {
        val card = (buffered ?: digits).filter { it.isDigit() }
        digits = ""
        if (card.isNotEmpty()) onCardDetected(card)
    }

    LaunchedEffect(enabled, refocusTick) {
        if (!enabled) return@LaunchedEffect
        runCatching { focusRequester.requestFocus() }
        // Focusing a text field must never pop the soft keyboard on a kiosk.
        keyboardController?.hide()
    }

    BasicTextField(
        value = digits,
        onValueChange = { raw ->
            if (!enabled) return@BasicTextField
            // Some readers deliver Enter as a newline instead of a key event.
            if (raw.contains('\n')) {
                submit(raw)
                return@BasicTextField
            }
            digits = raw.filter { it.isDigit() }.take(cardLength)
            if (digits.length == cardLength) submit()
        },
        modifier = Modifier
            .size(1.dp)
            .zIndex(-1f)
            .focusRequester(focusRequester)
            .onFocusChanged { if (enabled && !it.isFocused) refocusTick++ }
            .onKeyEvent { event ->
                if (enabled &&
                    event.type == KeyEventType.KeyDown &&
                    (event.key == Key.Enter || event.key == Key.NumPadEnter)
                ) {
                    submit()
                    true
                } else {
                    false
                }
            },
        enabled = enabled,
        singleLine = true,
        textStyle = TextStyle(color = Color.Transparent),
        cursorBrush = SolidColor(Color.Transparent),
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.NumberPassword,
            imeAction = ImeAction.Done
        ),
        keyboardActions = KeyboardActions(onDone = { submit() })
    )
}
