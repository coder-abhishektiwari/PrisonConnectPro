package com.prisonconnect.kiosk.ui.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.wallet.WalletTransaction
import com.prisonconnect.kiosk.ui.components.KioskErrorState
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import java.text.SimpleDateFormat
import java.util.*

private val MoneyGreen = Color(0xFF1B5E20)
private val MoneyGreenBg = Color(0xFFE8F5E9)
private val MoneyRed = Color(0xFFC62828)
private val MoneyRedBg = Color(0xFFFFEBEE)
private val PrimaryDark = Color(0xFF0B2240)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletScreen(
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    viewModel: WalletViewModel = hiltViewModel()
) {
    val state by viewModel.walletState.collectAsState()
    val isExpanded = windowSizeClass.widthSizeClass == WindowWidthSizeClass.Expanded

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("My Wallet", fontWeight = FontWeight.Bold)
                        Text(
                            "Aapka Jail Account Balance",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadWallet() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White
                )
            )
        },
        containerColor = Color(0xFFF4F6F9)
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
                            Column(
                                modifier = Modifier.weight(0.7f),
                                verticalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                WalletBalanceCard(data = s.data)
                                MoneySummaryCard(data = s.data)
                            }
                            WalletTransactionList(
                                data = s.data,
                                modifier = Modifier.weight(0.9f)
                            )
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            item { WalletBalanceCard(data = s.data) }
                            item { MoneySummaryCard(data = s.data) }
                            item {
                                Text(
                                    "Paise kyaane ka kharcha (Transactions)",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = PrimaryDark
                                )
                            }
                            if (s.data.transactions.isEmpty()) {
                                item {
                                    Card(
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(16.dp),
                                        colors = CardDefaults.cardColors(containerColor = Color.White)
                                    ) {
                                        Text(
                                            "Abhi tak koi kharcha nahi hua. Iski value ko wallet me jama karwaya gaya hai.",
                                            style = MaterialTheme.typography.bodyLarge,
                                            textAlign = TextAlign.Center,
                                            modifier = Modifier.padding(24.dp),
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            } else {
                                items(s.data.transactions) { tx ->
                                    TransactionRow(tx)
                                }
                            }
                        }
                    }
                }
                else -> Unit
            }
        }
    }
}

@Composable
private fun WalletBalanceCard(data: WalletViewModel.WalletUiData) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = PrimaryDark)
    ) {
        Column(modifier = Modifier.padding(24.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.AccountBalanceWallet,
                    contentDescription = null,
                    tint = Color(0xFFA8F5A2)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    "Jail Account Balance",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color(0xFFCFD8E3)
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "₹${String.format("%.2f", data.balance)}",
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Black,
                color = Color.White
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Aapke account me itne paise hain",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFFB0BFCE)
            )
        }
    }
}

@Composable
private fun MoneySummaryCard(data: WalletViewModel.WalletUiData) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            SummaryItem(
                icon = Icons.Default.RemoveCircle,
                title = "Calls par kharcha",
                value = "₹${String.format("%.2f", data.totalDeducted)}",
                valueColor = MoneyRed,
                bg = MoneyRedBg
            )
        }
    }
}

@Composable
private fun SummaryItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    value: String,
    valueColor: Color,
    bg: Color
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = valueColor,
            modifier = Modifier
                .size(44.dp)
                .background(bg, CircleShape)
                .padding(8.dp)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = valueColor
        )
    }
}

@Composable
private fun WalletTransactionList(
    data: WalletViewModel.WalletUiData,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Text(
            "Paise kyaane ka kharcha (Transactions)",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = PrimaryDark
        )
        Spacer(modifier = Modifier.height(12.dp))
        if (data.transactions.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Text(
                    "Abhi tak koi kharcha nahi hua.",
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(24.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(data.transactions) { tx ->
                    TransactionRow(tx)
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
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier
                    .size(48.dp)
                    .background(iconBg, CircleShape)
                    .padding(10.dp)
            )
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = tx.displayDescription,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = PrimaryDark
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = formatTransactionTime(tx.timestamp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                text = amountText,
                style = MaterialTheme.typography.titleLarge,
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