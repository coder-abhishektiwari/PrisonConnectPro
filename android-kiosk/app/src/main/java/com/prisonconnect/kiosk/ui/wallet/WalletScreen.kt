package com.prisonconnect.kiosk.ui.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.wallet.WalletTransaction
import com.prisonconnect.kiosk.ui.components.KioskErrorState
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.auth.IPhoneKeypad
import com.prisonconnect.kiosk.ui.theme.LightBg
import com.prisonconnect.kiosk.ui.theme.MoneyGreen
import com.prisonconnect.kiosk.ui.theme.MoneyGreenBg
import com.prisonconnect.kiosk.ui.theme.MoneyRed
import com.prisonconnect.kiosk.ui.theme.MoneyRedBg
import com.prisonconnect.kiosk.ui.theme.PrimaryDarkNavy
import com.prisonconnect.kiosk.ui.theme.PrimaryNavy
import com.prisonconnect.kiosk.ui.theme.TextDark
import com.prisonconnect.kiosk.ui.theme.TextGray
import java.text.SimpleDateFormat
import java.util.*


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletScreen(
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    viewModel: WalletViewModel = hiltViewModel()
) {
    val state by viewModel.walletState.collectAsState()
    val requestState by viewModel.requestState.collectAsState()
    val isExpanded = windowSizeClass.widthSizeClass == WindowWidthSizeClass.Expanded
    val snackbarHostState = remember { SnackbarHostState() }
    var showRequestDialog by remember { mutableStateOf(false) }

    // Success: close the dialog, toast, refresh. (Errors stay inside the dialog.)
    val requestSuccess = requestState.successMessage
    LaunchedEffect(requestSuccess) {
        if (requestSuccess != null) {
            showRequestDialog = false
            snackbarHostState.showSnackbar(requestSuccess)
            viewModel.clearRequestEvent()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "My Wallet",
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Color.White
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadWallet() }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = PrimaryNavy
                )
            )
        },
        containerColor = LightBg
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (val s = state) {
                is UiState.Loading -> KioskLoadingState()
                is UiState.Error -> KioskErrorState(
                    message = s.message,
                    onRetry = { viewModel.loadWallet() }
                )
                is UiState.Success -> {
                    if (isExpanded) {
                        Row(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(24.dp),
                            horizontalArrangement = Arrangement.spacedBy(20.dp)
                        ) {
                            WalletSummaryCard(
                                data = s.data,
                                onRequestClick = { showRequestDialog = true },
                                modifier = Modifier.weight(0.8f)
                            )
                            WalletTransactionsCard(
                                data = s.data,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp)
                        ) {
                            WalletSummaryCard(
                                data = s.data,
                                onRequestClick = { showRequestDialog = true }
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            WalletTransactionsCard(
                                data = s.data,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
                else -> Unit
            }
        }
    }

    if (showRequestDialog) {
        RequestBalanceDialog(
            state = requestState,
            onConfirm = { rupees -> viewModel.requestBalance(rupees) },
            onDismiss = {
                viewModel.clearRequestEvent()
                showRequestDialog = false
            }
        )
    }
}

/**
 * Amount keypad dialog: family ko paisa bhejne ka request.
 * AlertDialog must always carry confirmButton (material3 crashes without it).
 */
@Composable
private fun RequestBalanceDialog(
    state: WalletViewModel.RequestState,
    onConfirm: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    var amountInput by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { if (!state.submitting) onDismiss() },
        title = {
            Text(
                text = "Request Balance",
                fontWeight = FontWeight.Bold,
                color = PrimaryDarkNavy,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "How much should your family send?",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextGray
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = if (amountInput.isEmpty()) "\u20B90" else "\u20B9$amountInput",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = PrimaryDarkNavy
                )
                state.error?.let { err ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = err,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center
                    )
                }
                Spacer(modifier = Modifier.height(14.dp))
                IPhoneKeypad(
                    onNumberClick = { digit -> if (amountInput.length < 6) amountInput += digit },
                    onDeleteClick = { amountInput = amountInput.dropLast(1) }
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { amountInput.toIntOrNull()?.let(onConfirm) },
                enabled = !state.submitting && (amountInput.toIntOrNull() ?: 0) in 10..2000
            ) {
                if (state.submitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = PrimaryNavy
                    )
                } else {
                    Text("Send Request", color = PrimaryNavy, fontWeight = FontWeight.Bold)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = { if (!state.submitting) onDismiss() }) {
                Text("Cancel", color = TextGray)
            }
        }
    )
}

/** Balance + Request Balance button — ek hi card me. */
@Composable
private fun WalletSummaryCard(
    data: WalletViewModel.WalletUiData,
    onRequestClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC))
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 20.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
            // Balance (centered — Total Spent removed by request)
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.AccountBalanceWallet,
                    contentDescription = null,
                    tint = MoneyGreen,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    "Balance",
                    style = MaterialTheme.typography.labelSmall,
                    color = TextGray
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "₹${String.format("%.2f", data.balance)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = PrimaryDarkNavy
                )
            }
            }
            Spacer(modifier = Modifier.height(4.dp))
            OutlinedButton(
                onClick = onRequestClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Text("Request Balance from Family", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/** Transactions — simple, compact card with a capped scrollable list. */
@Composable
private fun WalletTransactionsCard(data: WalletViewModel.WalletUiData, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Transactions",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = PrimaryDarkNavy
            )
            Spacer(modifier = Modifier.height(10.dp))
            if (data.transactions.isEmpty()) {
                Text(
                    "No transactions yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 20.dp)
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(data.transactions) { tx -> TransactionRow(tx) }
                }
            }
        }
    }
}
@Composable
private fun TransactionRow(tx: WalletTransaction) {
    val isDebit = tx.isDebit
    val icon = if (isDebit) Icons.Default.RemoveCircle else Icons.Default.AddCircle
    val iconTint = if (isDebit) MoneyRed else MoneyGreen
    val iconBg = if (isDebit) MoneyRedBg else MoneyGreenBg
    val amountText = if (isDebit) "-₹${String.format("%.2f", tx.amount)}" else "+₹${String.format("%.2f", tx.amount)}"
    val amountColor = if (isDebit) MoneyRed else MoneyGreen

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier
                    .size(24.dp)
                    .background(iconBg, CircleShape)
                    .padding(4.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = tx.displayDescription,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = PrimaryDarkNavy,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = formatTransactionTime(tx.timestamp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                tx.chargesSubLine?.let { sub ->
                    Text(
                        text = sub,
                        style = MaterialTheme.typography.labelSmall,
                        color = TextGray
                    )
                }
            }
            Text(
                text = amountText,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = amountColor
            )
        }
    }
}

private fun formatTransactionTime(timestamp: String?): String {
    if (timestamp.isNullOrBlank()) return ""
    return try {
        val parsed = java.time.OffsetDateTime.parse(timestamp).toZonedDateTime()
        SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()).format(Date(parsed.toInstant().toEpochMilli()))
    } catch (e: Exception) {
        timestamp
    }
}

private fun formatRechargeDate(timestamp: String?): String {
    if (timestamp.isNullOrBlank()) return ""
    return try {
        val parsed = java.time.OffsetDateTime.parse(timestamp).toZonedDateTime()
        SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(Date(parsed.toInstant().toEpochMilli()))
    } catch (e: Exception) {
        timestamp
    }
}
