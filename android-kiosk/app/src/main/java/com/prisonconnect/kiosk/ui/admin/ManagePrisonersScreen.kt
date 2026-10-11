package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.models.admin.Prisoner
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.ui.components.ConfirmDeleteDialog
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

@Composable
fun ManagePrisonersScreen(
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    onPrisonerClick: (String) -> Unit,
    onEditClick: (String) -> Unit,
    onManageContactsClick: (String) -> Unit,
    onBiometricsClick: (String, String) -> Unit,
    viewModel: ManagePrisonersViewModel = hiltViewModel()
) {
    val prisoners by viewModel.prisoners.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val deletingPrisonerId by viewModel.deletingPrisonerId.collectAsState()
    val togglingPrisonerId by viewModel.togglingPrisonerId.collectAsState()
    val resetPinResult by viewModel.resetPinState.collectAsState()
    var showDeleteDialog by remember { mutableStateOf<Pair<String, String>?>(null) }
    var resetPinTarget by remember { mutableStateOf<Prisoner?>(null) }

    // Refresh list when screen becomes visible
    LaunchedEffect(Unit) {
        viewModel.refreshPrisoners()
    }

    if (showDeleteDialog != null) {
        val (prisonerId, prisonerName) = showDeleteDialog!!
        ConfirmDeleteDialog(
            title = "Delete Prisoner",
            message = "Are you sure you want to delete $prisonerName? This action cannot be undone.",
            onConfirm = {
                viewModel.deletePrisoner(prisonerId)
                showDeleteDialog = null
            },
            onDismiss = { showDeleteDialog = null }
        )
    }

    ManagePrisonersContent(
        prisoners = viewModel.getFilteredPrisoners(),
        searchQuery = searchQuery,
        isLoading = isLoading,
        error = error,
        deletingPrisonerId = deletingPrisonerId,
        togglingPrisonerId = togglingPrisonerId,
        resetPinResult = resetPinResult,
        resetPinTarget = resetPinTarget,
        onBackClick = onBackClick,
        onPrisonerClick = onPrisonerClick,
        onEditClick = onEditClick,
        onToggleActive = { prisonerId, active -> viewModel.setPrisonerActive(prisonerId, active) },
        onManageContactsClick = onManageContactsClick,
        onBiometricsClick = onBiometricsClick,
        onSearchQueryChange = { viewModel.updateSearchQuery(it) },
        onDeleteClick = { prisonerId, prisonerName -> showDeleteDialog = Pair(prisonerId, prisonerName) },
        onResetPinClick = { prisoner ->
            resetPinTarget = prisoner
            viewModel.resetResetPinState()
        },
        onResetPinSubmit = { prisonerId, pin -> viewModel.resetPrisonerPin(prisonerId, pin) },
        onResetPinDismissed = {
            resetPinTarget = null
            viewModel.resetResetPinState()
        }
    )
}

@Composable
fun ManagePrisonersContent(
    prisoners: List<Prisoner>,
    searchQuery: String,
    isLoading: Boolean = false,
    error: String? = null,
    deletingPrisonerId: String? = null,
    togglingPrisonerId: String? = null,
    resetPinResult: NetworkResult<String>? = null,
    resetPinTarget: Prisoner? = null,
    onBackClick: () -> Unit,
    onPrisonerClick: (String) -> Unit,
    onEditClick: (String) -> Unit = {},
    onToggleActive: (String, Boolean) -> Unit,
    onManageContactsClick: (String) -> Unit = {},
    onBiometricsClick: (String, String) -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onDeleteClick: (String, String) -> Unit,
    onResetPinClick: (Prisoner) -> Unit = {},
    onResetPinSubmit: (String, String) -> Unit = { _, _ -> },
    onResetPinDismissed: () -> Unit = {}
) {
    var resetPinValue by remember(resetPinTarget) { mutableStateOf("") }
    var resetPinError by remember(resetPinTarget) { mutableStateOf("") }
    var resetPinSuccess by remember(resetPinTarget) { mutableStateOf(false) }
    val resetPinLoading = resetPinResult is NetworkResult.Loading

    LaunchedEffect(resetPinResult) {
        if (resetPinResult is NetworkResult.Success) {
            resetPinSuccess = true
            resetPinValue = ""
            resetPinError = ""
        } else if (resetPinResult is NetworkResult.Failure) {
            resetPinError = resetPinResult.error.message ?: "Failed to reset PIN"
        }
    }

    if (resetPinTarget != null) {
        AlertDialog(
            onDismissRequest = {
                resetPinValue = ""
                resetPinError = ""
                resetPinSuccess = false
                onResetPinDismissed()
            },
            title = { Text("Reset PIN") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (resetPinSuccess) {
                        Text("PIN reset successfully!", color = Color(0xFF2E7D32))
                    } else {
                        if (resetPinError.isNotEmpty()) {
                            Text(resetPinError, color = Color(0xFFD32F2F), fontSize = 13.sp)
                        }
                        Text("Enter a new 6-digit PIN for ${resetPinTarget.displayName}", fontSize = 14.sp)
                        OutlinedTextField(
                            value = resetPinValue,
                            onValueChange = {
                                if (it.length <= 6 && it.all { c -> c.isDigit() }) {
                                    resetPinValue = it
                                    resetPinError = ""
                                }
                            },
                            label = { Text("New PIN") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            isError = resetPinValue.isNotEmpty() && resetPinValue.length != 6,
                            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                                keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword
                            )
                        )
                        if (resetPinValue.isNotEmpty() && resetPinValue.length != 6) {
                            Text(
                                "PIN must be exactly 6 digits",
                                color = Color(0xFFD32F2F),
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            },
            confirmButton = {
                if (!resetPinSuccess) {
                    TextButton(
                        enabled = !resetPinLoading,
                        onClick = {
                            if (resetPinValue.length != 6) {
                                resetPinError = "PIN must be exactly 6 digits"
                            } else {
                                resetPinError = ""
                                onResetPinSubmit(resetPinTarget.inmateId, resetPinValue)
                            }
                        }
                    ) {
                        if (resetPinLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("Reset")
                        }
                    }
                } else {
                    TextButton(onClick = {
                        resetPinSuccess = false
                        onResetPinDismissed()
                    }) {
                        Text("Done", color = Color(0xFF003366))
                    }
                }
            },
            dismissButton = {
                if (!resetPinSuccess && !resetPinLoading) {
                    TextButton(onClick = {
                        resetPinValue = ""
                        resetPinError = ""
                        onResetPinDismissed()
                    }) {
                        Text("Cancel")
                    }
                }
            }
        )
    }

    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Manage Inmates",
                showBackButton = true,
                onBackClick = onBackClick
            )
        },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
        ) {
            // Search Bar
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(2.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        tint = Color(0xFF687A8F),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    TextField(
                        value = searchQuery,
                        onValueChange = onSearchQueryChange,
                        placeholder = { Text("Search inmates...") },
                        modifier = Modifier.fillMaxWidth(),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent
                        ),
                        singleLine = true
                    )
                }
            }

            // Error Banner
            if (error != null) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Error,
                            contentDescription = null,
                            tint = Color(0xFFD32F2F),
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = error ?: "",
                            color = Color(0xFFD32F2F),
                            fontSize = 14.sp,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            // Inmates List
            if (isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Color(0xFF003366))
                }
            } else if (prisoners.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = Color(0xFF687A8F).copy(alpha = 0.5f)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "No inmates found",
                            fontSize = 18.sp,
                            color = Color(0xFF687A8F)
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(bottom = 16.dp)
                ) {
                    items(prisoners) { prisoner ->
                        PrisonerCard(
                            prisoner = prisoner,
                            isDeleting = deletingPrisonerId == prisoner.inmateId,
                            isToggling = togglingPrisonerId == prisoner.inmateId,
                            onClick = { onPrisonerClick(prisoner.inmateId) },
                            onEditClick = { onEditClick(prisoner.inmateId) },
                            onToggleActive = { onToggleActive(prisoner.inmateId, it) },
                            onManageContactsClick = { onManageContactsClick(prisoner.inmateId) },
                            onBiometricsClick = { onBiometricsClick(prisoner.inmateId, prisoner.displayName) },
                            onResetPinClick = { onResetPinClick(prisoner) },
                            onDeleteClick = { onDeleteClick(prisoner.inmateId, prisoner.displayName) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PrisonerCard(
    prisoner: Prisoner,
    isDeleting: Boolean = false,
    isToggling: Boolean = false,
    onClick: () -> Unit,
    onEditClick: () -> Unit,
    onToggleActive: (Boolean) -> Unit,
    onManageContactsClick: () -> Unit,
    onBiometricsClick: () -> Unit,
    onResetPinClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    val isActive = prisoner.status.equals("active", ignoreCase = true)
    val initial = prisoner.displayName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    val gender = prisoner.gender
    val age = prisoner.age

    val idLine = buildString {
        append("Inmate no: ")
        append(prisoner.prisonerNumber ?: prisoner.inmateId)
        if (!gender.isNullOrBlank()) {
            append(" - ")
            append(gender.replaceFirstChar { it.uppercaseChar() })
        }
        if (age != null) {
            append(" - ")
            append(age)
            append("years")
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(3.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Avatar with initial
                Surface(
                    shape = CircleShape,
                    color = if (isActive) Color(0xFF003366).copy(alpha = 0.1f) else Color(0xFF90A4AE).copy(alpha = 0.2f),
                    modifier = Modifier.size(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = initial,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isActive) Color(0xFF003366) else Color(0xFF687A8F)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(16.dp))

                // Name + number with gender/age in the same style
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = prisoner.displayName,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0B2240),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = idLine,
                        fontSize = 13.sp,
                        color = Color(0xFF687A8F),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                // Active / inactive toggle
                if (isToggling) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp,
                        color = Color(0xFF003366)
                    )
                } else {
                    Switch(
                        checked = isActive,
                        onCheckedChange = onToggleActive,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = Color(0xFF2E7D32),
                            checkedBorderColor = Color(0xFF2E7D32),
                            uncheckedThumbColor = Color.White,
                            uncheckedTrackColor = Color(0xFFCFD8DC),
                            uncheckedBorderColor = Color(0xFFB0BEC5)
                        )
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    TextButton(onClick = onManageContactsClick) {
                        Icon(Icons.Default.Group, contentDescription = null, modifier = Modifier.size(20.dp))
                    }
                    TextButton(onClick = onBiometricsClick) {
                        Icon(Icons.Default.Fingerprint, contentDescription = null, modifier = Modifier.size(20.dp))
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onEditClick) {
                        Icon(
                            imageVector = Icons.Default.Edit,
                            contentDescription = "Edit",
                            tint = Color(0xFF003366),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    IconButton(onClick = onResetPinClick) {
                        Icon(
                            imageVector = Icons.Default.LockReset,
                            contentDescription = "Reset PIN",
                            tint = Color(0xFFF57C00),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    IconButton(
                        onClick = onDeleteClick,
                        enabled = !isDeleting
                    ) {
                        if (isDeleting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                strokeWidth = 2.dp,
                                color = Color(0xFFD32F2F)
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "Delete",
                                tint = Color(0xFFD32F2F),
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

// --- PREVIEWS ---

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewManagePrisonersMobile() {
    PrisonKioskTheme {
        ManagePrisonersContent(
            prisoners = listOf(
                Prisoner(
                    inmateId = "INM123456",
                    firstName = "RAHUL",
                    lastName = "KUMAR",
                    prisonerNumber = "PR-0042",
                    idNumber = "4521 7788 9900",
                    gender = "male",
                    age = 34,
                    district = "Lucknow",
                    status = "active"
                ),
                Prisoner(
                    inmateId = "INM654321",
                    firstName = "AMIT",
                    lastName = "SHARMA",
                    prisonerNumber = "PR-0043",
                    idNumber = "7781 2233 4455",
                    gender = "male",
                    age = 28,
                    district = "Kanpur",
                    status = "suspended"
                ),
                Prisoner(
                    inmateId = "INM999888",
                    firstName = "VIJAY",
                    lastName = "SINGH",
                    prisonerNumber = "PR-0044",
                    idNumber = "3390 5566 1122",
                    gender = "male",
                    age = 41,
                    district = "Varanasi",
                    status = "active"
                )
            ),
            searchQuery = "",
            onBackClick = {},
            onPrisonerClick = {},
            onToggleActive = { _, _ -> },
            onBiometricsClick = { _, _ -> },
            onDeleteClick = { _, _ -> },
            onSearchQueryChange = {}
        )
    }
}
