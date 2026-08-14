package com.prisonconnect.kiosk.ui.receipt

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.R
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

private val PrimaryNavy = Color(0xFF003366)
private val LightBg = Color(0xFFF4F7FA)
private val SuccessGreen = Color(0xFF4CAF50)
private val TextDark = Color(0xFF1E293B)
private val TextGray = Color(0xFF64748B)

@Composable
fun CallSummaryScreen(
    contactName: String,
    duration: String,
    totalCharged: String,
    @Suppress("UNUSED_PARAMETER") windowSizeClass: WindowSizeClass,
    onBackToHome: () -> Unit,
    viewModel: SummaryViewModel = hiltViewModel()
) {
    val inmateProfile by viewModel.inmateProfile.collectAsState()

    CallSummaryContent(
        inmateName = inmateProfile?.let { "${it.firstName} ${it.lastName}" } ?: "N/A",
        inmateId = inmateProfile?.inmateId ?: "N/A",
        contactName = contactName,
        duration = duration,
        totalCharged = totalCharged,
        onPrintReceipt = { viewModel.onPrintReceipt() },
        onBackToHome = onBackToHome
    )
}

@Composable
fun CallSummaryContent(
    inmateName: String,
    inmateId: String,
    contactName: String,
    duration: String,
    totalCharged: String,
    onPrintReceipt: () -> Unit,
    onBackToHome: () -> Unit
) {
    Scaffold(
        topBar = { KioskTopBar( title = "Call Summary") },
        containerColor = LightBg
    ) { padding ->
        BoxWithConstraints(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            val isTablet = maxWidth >= 600.dp
            val hPadding = if (isTablet) 32.dp else 16.dp
            val cardWidthFraction = if (isTablet) 0.65f else 1f

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = hPadding, vertical = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(modifier = Modifier.height(if (isTablet) 24.dp else 12.dp))

                // SUCCESS ICON
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = SuccessGreen,
                    modifier = Modifier.size(if (isTablet) 80.dp else 64.dp)
                )

                Spacer(modifier = Modifier.height(12.dp))

                // HEADINGS
                Text(
                    text = stringResource(R.string.call_ended_successfully),
                    fontSize = if (isTablet) 24.sp else 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextDark,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.max_duration_reached),
                    fontSize = if (isTablet) 14.sp else 12.sp,
                    color = TextGray,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(24.dp))

                // RECEIPT CARD
                Card(
                    modifier = Modifier.fillMaxWidth(cardWidthFraction),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(if (isTablet) 28.dp else 18.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.receipt).uppercase(),
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center,
                            fontSize = if (isTablet) 16.sp else 14.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 1.sp,
                            color = TextDark
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "Prison Video Kiosk • Call Receipt",
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center,
                            fontSize = if (isTablet) 12.sp else 11.sp,
                            color = TextGray
                        )

                        HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp), color = Color(0xFFE2E8F0))

                        ReceiptRow("Inmate ID", inmateId, isTablet = isTablet)
                        ReceiptRow("Inmate Name", inmateName, isTablet = isTablet)
                        ReceiptRow("Contact Person", contactName, isTablet = isTablet)
                        ReceiptRow("Date", "27 May 2025", isTablet = isTablet)
                        ReceiptRow("Duration", "$duration Min", isTablet = isTablet)
                        ReceiptRow("Call Type", "Video", isTablet = isTablet)

                        HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp), color = Color(0xFFE2E8F0))

                        ReceiptRow(
                            label = stringResource(R.string.total_charged),
                            value = "₹$totalCharged",
                            isTotal = true,
                            isTablet = isTablet
                        )
                        ReceiptRow(
                            label = stringResource(R.string.remaining_balance),
                            value = "₹40.00",
                            isTablet = isTablet
                        )

                        HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp), color = Color(0xFFE2E8F0))

                        Text(
                            text = "Thank you for using the service.",
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center,
                            fontSize = if (isTablet) 12.sp else 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextGray
                        )
                    }
                }

                Spacer(modifier = Modifier.height(28.dp))

                // ACTION BUTTONS (Responsive Layout)
                if (isTablet) {
                    Row(
                        modifier = Modifier.fillMaxWidth(cardWidthFraction),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        OutlinedButton(
                            onClick = onPrintReceipt,
                            modifier = Modifier.weight(1f).height(52.dp),
                            shape = RoundedCornerShape(14.dp),
                            border = androidx.compose.foundation.BorderStroke(1.5.dp, PrimaryNavy)
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Print, contentDescription = null, tint = PrimaryNavy)
                                Text(
                                    text = stringResource(R.string.print_receipt),
                                    fontWeight = FontWeight.Bold,
                                    color = PrimaryNavy
                                )
                            }
                        }

                        Button(
                            onClick = onBackToHome,
                            modifier = Modifier.weight(1f).height(52.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy)
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Home, contentDescription = null)
                                Text(
                                    text = "Go to Home",
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxWidth(cardWidthFraction),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = onBackToHome,
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryNavy)
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Home, contentDescription = null)
                                Text(
                                    text = "Go to Home",
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        OutlinedButton(
                            onClick = onPrintReceipt,
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            shape = RoundedCornerShape(12.dp),
                            border = androidx.compose.foundation.BorderStroke(1.5.dp, PrimaryNavy)
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Print, contentDescription = null, tint = PrimaryNavy)
                                Text(
                                    text = stringResource(R.string.print_receipt),
                                    fontWeight = FontWeight.Bold,
                                    color = PrimaryNavy
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

@Composable
fun ReceiptRow(
    label: String,
    value: String,
    isTotal: Boolean = false,
    isTablet: Boolean = false
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = if (isTotal) (if (isTablet) 15.sp else 13.sp) else (if (isTablet) 13.sp else 11.sp),
            fontWeight = if (isTotal) FontWeight.Bold else FontWeight.Medium,
            color = if (isTotal) TextDark else TextGray,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = value,
            fontSize = if (isTotal) (if (isTablet) 18.sp else 15.sp) else (if (isTablet) 14.sp else 12.sp),
            fontWeight = if (isTotal) FontWeight.Black else FontWeight.Bold,
            color = if (isTotal) PrimaryNavy else TextDark,
            textAlign = TextAlign.End,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

// --- PREVIEWS ---

//@Preview(name = "Tablet View", device = "spec:width=800dp,height=1280dp,orientation=portrait", showBackground = true)
//@Composable
//fun PreviewCallSummaryTablet() {
//    PrisonKioskTheme {
//        CallSummaryContent(
//            inmateName = "RAHUL KUMAR",
//            inmateId = "INM123456",
//            contactName = "Suresh Kumar",
//            duration = "5:00",
//            totalCharged = "10.00",
//            onPrintReceipt = {},
//            onBackToHome = {}
//        )
//    }
//}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewCallSummaryMobile() {
    PrisonKioskTheme {
        CallSummaryContent(
            inmateName = "RAHUL KUMAR",
            inmateId = "INM123456",
            contactName = "Suresh Kumar",
            duration = "5:00",
            totalCharged = "10.00",
            onPrintReceipt = {},
            onBackToHome = {}
        )
    }
}
