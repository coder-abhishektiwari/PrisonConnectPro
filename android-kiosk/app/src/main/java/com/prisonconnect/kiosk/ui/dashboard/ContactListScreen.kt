package com.prisonconnect.kiosk.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.prisonconnect.kiosk.R
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.ui.components.KioskEmptyState
import com.prisonconnect.kiosk.ui.components.KioskErrorState
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme

@Composable
fun ContactListScreen(
    onContactClick: (String, String) -> Unit,
    onContactDetailClick: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: ContactListViewModel = hiltViewModel()
) {
    val contactsState by viewModel.contactsUiState.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()

    Scaffold(
        topBar = {
            KioskTopBar( title = "Contacts List", showBackButton = true, onBackClick = onBack)
        },
        containerColor = Color.White
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 24.dp)
        ) {
            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = stringResource(R.string.verified_contacts),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0B2240)
            )

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = searchQuery,
                onValueChange = viewModel::onSearchQueryChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Search approved contacts by name or relation...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    unfocusedContainerColor = Color.White,
                    focusedContainerColor = Color.White
                ),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(24.dp))

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when (val state = contactsState) {
                    is UiState.Loading -> KioskLoadingState()
                    is UiState.Error -> KioskErrorState(message = state.message, onRetry = { viewModel.loadContacts() })
                    is UiState.Empty -> KioskEmptyState(message = "No approved contacts found")
                    is UiState.Success -> {
                        if (state.data.isEmpty()) {
                            KioskEmptyState(message = "No matching contacts found")
                        } else {
                            ContactGrid(
                                contacts = state.data,
                                onContactClick = onContactDetailClick,
                                onCallClick = { name -> onContactClick(name, "Audio") },
                                onVideoClick = { name -> onContactClick(name, "Video") }
                            )
                        }
                    }
                    else -> Unit
                }
            }
        }
    }
}

@Composable
fun ContactGrid(
    contacts: List<Contact>,
    onContactClick: (String) -> Unit,
    onCallClick: (String) -> Unit,
    onVideoClick: (String) -> Unit
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 300.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        items(contacts) { contact ->
            ApprovedContactCard(
                contact = contact,
                onClick = { onContactClick(contact.id.orEmpty()) },
                onCallClick = { onCallClick(contact.fullName.orEmpty()) },
                onVideoClick = { onVideoClick(contact.fullName.orEmpty()) }
            )
        }
    }
}

@Composable
fun ApprovedContactCard(
    contact: Contact,
    onClick: () -> Unit,
    onCallClick: () -> Unit,
    onVideoClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AsyncImage(
                model = contact.photoUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFF0F4F8)),
                contentScale = ContentScale.Crop,
                placeholder = rememberVectorPainter(Icons.Default.Person),
                error = rememberVectorPainter(Icons.Default.Person)
            )

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = contact.fullName.orEmpty(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = contact.relationship.orEmpty(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = contact.phoneNumber.orEmpty(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                IconButton(onClick = onCallClick) {
                    Icon(Icons.Default.Call, contentDescription = null, tint = Color(0xFF003366))
                }
                IconButton(onClick = onVideoClick) {
                    Icon(Icons.Default.Videocam, contentDescription = null, tint = Color(0xFF003366))
                }
            }
        }
    }
}

// --- PREVIEWS ---

//@Preview(name = "Tablet View", device = "spec:width=1280dp,height=800dp,orientation=portrait", showBackground = true)
//@Composable
//fun PreviewContactListTablet() {
//    PrisonKioskTheme {
//        Surface(color = Color.White, modifier = Modifier.fillMaxSize()) {
//            ContactGrid(
//                contacts = listOf(
//                    Contact(
//                        id = "1",
//                        fullName = "Suresh Kumar",
//                        relationship = "Brother",
//                        phoneNumber = "9876543210",
//                        isApproved = true
//                    )
//                ),
//                onContactClick = {},
//                onCallClick = {},
//                onVideoClick = {}
//            )
//        }
//    }
//}

@Preview(name = "Mobile View", device = "spec:width=360dp,height=800dp", showBackground = true)
@Composable
fun PreviewContactListMobile() {
    PrisonKioskTheme {
        Surface(color = Color.White, modifier = Modifier.fillMaxSize()) {
            ContactGrid(
                contacts = listOf(
                    Contact(
                        id = "1",
                        fullName = "Suresh Kumar",
                        relationship = "Brother",
                        phoneNumber = "9876543210",
                        isApproved = true
                    )
                ),
                onContactClick = {},
                onCallClick = {},
                onVideoClick = {}
            )
        }
    }
}
