package com.prisonconnect.kiosk.ui.admin

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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.models.admin.Prisoner
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

@Composable
fun ManagePrisonersScreen(
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    onPrisonerClick: (String) -> Unit,
    onManageContactsClick: (String) -> Unit,
    viewModel: ManagePrisonersViewModel = hiltViewModel()
) {
    val prisoners by viewModel.prisoners.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()

    // Refresh list when screen becomes visible
    LaunchedEffect(Unit) {
        viewModel.refreshPrisoners()
    }

    ManagePrisonersContent(
        prisoners = viewModel.getFilteredPrisoners(),
        searchQuery = searchQuery,
        onBackClick = onBackClick,
        onPrisonerClick = onPrisonerClick,
        onManageContactsClick = onManageContactsClick,
        onSearchQueryChange = { viewModel.updateSearchQuery(it) },
        onDeleteClick = { prisonerId -> viewModel.deletePrisoner(prisonerId) }
    )
}

@Composable
fun ManagePrisonersContent(
    prisoners: List<Prisoner>,
    searchQuery: String,
    onBackClick: () -> Unit,
    onPrisonerClick: (String) -> Unit,
    onManageContactsClick: (String) -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onDeleteClick: (String) -> Unit
) {
    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Manage Prisoners",
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
                        placeholder = { Text("Search prisoners...") },
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

            // Prisoners List
            if (prisoners.isEmpty()) {
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
                            text = "No prisoners found",
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
                            onClick = { onPrisonerClick(prisoner.inmateId) },
                            onManageContactsClick = { onManageContactsClick(prisoner.inmateId) },
                            onDeleteClick = { onDeleteClick(prisoner.inmateId) }
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
    onClick: () -> Unit,
    onManageContactsClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Avatar
                Surface(
                    shape = CircleShape,
                    color = Color(0xFF003366).copy(alpha = 0.1f),
                    modifier = Modifier.size(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = Color(0xFF003366),
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(16.dp))

                // Details
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = prisoner.displayName,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0B2240)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = prisoner.inmateId,
                        fontSize = 14.sp,
                        color = Color(0xFF687A8F)
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconButton(onClick = onClick) {
                        Icon(
                            imageVector = Icons.Default.Edit,
                            contentDescription = "Edit",
                            tint = Color(0xFF003366)
                        )
                    }
                    IconButton(onClick = onDeleteClick) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Delete",
                            tint = Color(0xFFD32F2F)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFE3F2FD)
                    ) {
                        Text(
                            text = prisoner.cellBlock ?: "Can't fetch",
                            fontSize = 12.sp,
                            color = Color(0xFF003366),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = when (prisoner.status.uppercase()) {
                            "ACTIVE" -> Color(0xFFE8F5E9)
                            "RESTRICTED" -> Color(0xFFFFF3E0)
                            "SUSPENDED" -> Color(0xFFFFEBEE)
                            else -> Color(0xFFF5F5F5)
                        }
                    ) {
                        Text(
                            text = prisoner.status.uppercase(),
                            fontSize = 12.sp,
                            color = when (prisoner.status.uppercase()) {
                                "ACTIVE" -> Color(0xFF2E7D32)
                                "RESTRICTED" -> Color(0xFFF57C00)
                                "SUSPENDED" -> Color(0xFFD32F2F)
                                else -> Color(0xFF757575)
                            },
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                TextButton(onClick = onManageContactsClick) {
                    Icon(Icons.Default.Group, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Contacts", fontSize = 14.sp)
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
                    cellBlock = "B-12 / 04",
                    status = "active"
                ),
                Prisoner(
                    inmateId = "INM654321",
                    firstName = "AMIT",
                    lastName = "SHARMA",
                    cellBlock = "A-05 / 10",
                    status = "restricted"
                ),
                Prisoner(
                    inmateId = "INM999888",
                    firstName = "VIJAY",
                    lastName = "SINGH",
                    cellBlock = "C-01 / 22",
                    status = "suspended"
                )
            ),
            searchQuery = "",
            onBackClick = {},
            onPrisonerClick = {},
            onManageContactsClick = {},
            onDeleteClick = {},
            onSearchQueryChange = {}
        )
    }
}
