package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.models.admin.VerifiedContact
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.ui.components.KioskTopBar

@Composable
fun ManageContactsScreen(
    prisonerId: String,
    onBackClick: () -> Unit,
    viewModel: ManageContactsViewModel = hiltViewModel()
) {
    val contactsResult by viewModel.contacts.collectAsState()
    var showAddDialog by remember { mutableStateOf(false) }

    LaunchedEffect(prisonerId) {
        viewModel.loadContacts(prisonerId)
    }

    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Verified Contacts",
                showBackButton = true,
                onBackClick = onBackClick
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = Color(0xFF003366),
                contentColor = Color.White
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add Contact")
            }
        },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues).fillMaxSize()) {
            when (val result = contactsResult) {
                is NetworkResult.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                is NetworkResult.Success -> {
                    if (result.data.isEmpty()) {
                        EmptyContactsView(modifier = Modifier.align(Alignment.Center))
                    } else {
                        ContactsList(
                            contacts = result.data,
                            onToggleStatus = { contactId, active ->
                                viewModel.toggleContactStatus(contactId, prisonerId, active)
                            }
                        )
                    }
                }
                is NetworkResult.Failure -> {
                    Text(
                        text = result.error.message ?: "Failed to load contacts",
                        color = Color.Red,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                else -> {}
            }
        }
    }

    if (showAddDialog) {
        AddContactDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { name, mobile, relation ->
                viewModel.addContact(prisonerId, name, mobile, relation)
                showAddDialog = false
            }
        )
    }
}

@Composable
fun ContactsList(
    contacts: List<VerifiedContact>,
    onToggleStatus: (String, Boolean) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(contacts) { contact ->
            ContactItem(contact, onToggleStatus)
        }
    }
}

@Composable
fun ContactItem(
    contact: VerifiedContact,
    onToggleStatus: (String, Boolean) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = CircleShape,
                color = Color(0xFF003366).copy(alpha = 0.1f),
                modifier = Modifier.size(48.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Person, contentDescription = null, tint = Color(0xFF003366))
                }
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(contact.displayName, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(contact.phone, color = Color.Gray, fontSize = 14.sp)
                Text(contact.relationship ?: "Contact", color = Color(0xFF003366), fontSize = 12.sp)
            }
            Switch(
                checked = contact.active,
                onCheckedChange = { onToggleStatus(contact.contactId, it) }
            )
        }
    }
}

@Composable
fun EmptyContactsView(modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier) {
        Icon(Icons.Default.GroupOff, contentDescription = null, modifier = Modifier.size(64.dp), tint = Color.LightGray)
        Spacer(modifier = Modifier.height(16.dp))
        Text("No verified contacts found", color = Color.Gray)
    }
}

@Composable
fun AddContactDialog(
    onDismiss: () -> Unit,
    onConfirm: (String, String, String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var mobile by remember { mutableStateOf("") }
    var relation by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Verified Contact") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Full Name") })
                OutlinedTextField(value = mobile, onValueChange = { mobile = it }, label = { Text("Mobile Number") })
                OutlinedTextField(value = relation, onValueChange = { relation = it }, label = { Text("Relationship") })
            }
        },
        confirmButton = {
            Button(onClick = { onConfirm(name, mobile, relation) }) { Text("Add") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
