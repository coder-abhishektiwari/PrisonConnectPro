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
import com.prisonconnect.kiosk.ui.components.ConfirmDeleteDialog
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

@Composable
fun ManagePrisonersScreen(
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    onPrisonerClick: (String) -> Unit,
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
    var showDeleteDialog by remember { mutableStateOf<Pair<String, String>?>(null) }

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
        onBackClick = onBackClick,
        onPrisonerClick = onPrisonerClick,
        onToggleActive = { prisonerId, active -> viewModel.setPrisonerActive(prisonerId, active) },
        onManageContactsClick = onManageContactsClick,
        onBiometricsClick = onBiometricsClick,
        onSearchQueryChange = { viewModel.updateSearchQuery(it) },
        onDeleteClick = { prisonerId, prisonerName -> showDeleteDialog = Pair(prisonerId, prisonerName) }
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
    onBackClick: () -> Unit,
    onPrisonerClick: (String) -> Unit,
    onToggleActive: (String, Boolean) -> Unit,
    onManageContactsClick: (String) -> Unit,
    onBiometricsClick: (String, String) -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onDeleteClick: (String, String) -> Unit
) {
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
                            onToggleActive = { onToggleActive(prisoner.inmateId, it) },
                            onManageContactsClick = { onManageContactsClick(prisoner.inmateId) },
                            onBiometricsClick = { onBiometricsClick(prisoner.inmateId, prisoner.displayName) },
                            onDeleteClick = { onDeleteClick(prisoner.inmateId, prisoner.displayName) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MetaChip(text: String, containerColor: Color, contentColor: Color) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = containerColor
    ) {
        Text(
            text = text,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = contentColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun PrisonerCard(
    prisoner: Prisoner,
    isDeleting: Boolean = false,
    isToggling: Boolean = false,
    onClick: () -> Unit,
    onToggleActive: (Boolean) -> Unit,
    onManageContactsClick: () -> Unit,
    onBiometricsClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    val isActive = prisoner.status.equals("active", ignoreCase = true)
    val initial = prisoner.displayName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    val age = prisoner.age

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

                // Name + ids
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
                        text = listOfNotNull(
                            prisoner.inmateId,
                            prisoner.prisonerNumber
                        ).joinToString("  •  "),
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

            // Quick info chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val gender = prisoner.gender
                if (!gender.isNullOrBlank()) {
                    MetaChip(
                        text = gender.replaceFirstChar { it.uppercaseChar() } + (age?.let { " • $it yrs" } ?: ""),
                        containerColor = Color(0xFFE3F2FD),
                        contentColor = Color(0xFF003366)
                    )
                } else if (age != null) {
                    MetaChip(
                        text = "$age yrs",
                        containerColor = Color(0xFFE3F2FD),
                        contentColor = Color(0xFF003366)
                    )
                }
                val idNumber = prisoner.idNumber
                if (!idNumber.isNullOrBlank()) {
                    MetaChip(
                        text = idNumber,
                        containerColor = Color(0xFFF1F8E9),
                        contentColor = Color(0xFF2E7D32)
                    )
                }
                val district = prisoner.district
                if (!district.isNullOrBlank()) {
                    MetaChip(
                        text = district,
                        containerColor = Color(0xFFFFF3E0),
                        contentColor = Color(0xFFF57C00)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = onManageContactsClick) {
                        Icon(Icons.Default.Group, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Contacts", fontSize = 14.sp)
                    }
                    TextButton(onClick = onBiometricsClick) {
                        Icon(Icons.Default.Fingerprint, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Biometrics", fontSize = 14.sp)
                    }
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
                            tint = Color(0xFFD32F2F)
                        )
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
            onManageContactsClick = {},
            onBiometricsClick = { _, _ -> },
            onDeleteClick = { _, _ -> },
            onSearchQueryChange = {}
        )
    }
}
