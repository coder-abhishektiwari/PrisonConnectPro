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
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.components.KioskTopBar

@Composable
fun ManageContactsScreen(
    prisonerId: String,
    onBackClick: () -> Unit,
    viewModel: ManageContactsViewModel = hiltViewModel()
) {
    val contactsResult by viewModel.contacts.collectAsState()
    val addResult by viewModel.addContactState.collectAsState()
    val editResult by viewModel.editContactState.collectAsState()
    val deleteResult by viewModel.deleteContactState.collectAsState()
    var showAddDialog by remember { mutableStateOf(false) }
    var showEditDialog by remember { mutableStateOf<VerifiedContact?>(null) }
    var showDeleteConfirm by remember { mutableStateOf<VerifiedContact?>(null) }
    var snackbarMessage by remember { mutableStateOf<String?>(null) }

    // Auto-dismiss snackbar after 3 seconds
    LaunchedEffect(snackbarMessage) {
        if (snackbarMessage != null) {
            kotlinx.coroutines.delay(3000L)
            snackbarMessage = null
        }
    }

    LaunchedEffect(prisonerId) {
        viewModel.loadContacts(prisonerId)
    }

    // Feedback from mutations
    LaunchedEffect(addResult) {
        when (addResult) {
            is NetworkResult.Success -> { snackbarMessage = "Contact added"; viewModel.resetAddState() }
            is NetworkResult.Failure -> { snackbarMessage = "Failed to add contact"; viewModel.resetAddState() }
            else -> {}
        }
    }
    LaunchedEffect(editResult) {
        when (editResult) {
            is NetworkResult.Success -> { snackbarMessage = "Contact updated"; viewModel.resetEditState() }
            is NetworkResult.Failure -> { snackbarMessage = "Failed to update contact"; viewModel.resetEditState() }
            else -> {}
        }
    }
    LaunchedEffect(deleteResult) {
        when (deleteResult) {
            is NetworkResult.Success -> { snackbarMessage = "Contact deleted"; viewModel.resetDeleteState() }
            is NetworkResult.Failure -> { snackbarMessage = "Failed to delete contact"; viewModel.resetDeleteState() }
            else -> {}
        }
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
        snackbarHost = {
            snackbarMessage?.let { msg ->
                Snackbar {
                    Text(msg)
                }
            }
        },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues).fillMaxSize()) {
            when (val result = contactsResult) {
                is NetworkResult.Loading -> {
                    // Only show spinner on first load (no existing data)
                    if (result !is NetworkResult.Success) {
                        KioskLoadingState(modifier = Modifier.align(Alignment.Center))
                    }
                }
                is NetworkResult.Success -> {
                    if (result.data.isEmpty()) {
                        EmptyContactsView(modifier = Modifier.align(Alignment.Center))
                    } else {
                        ContactsList(
                            contacts = result.data,
                            onToggleStatus = { contactId, active ->
                                viewModel.toggleContactStatus(contactId, prisonerId, active)
                            },
                            onEdit = { showEditDialog = it },
                            onDelete = { showDeleteConfirm = it }
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

    // Add Dialog
    if (showAddDialog) {
        AddContactDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { name, mobile, relation ->
                viewModel.addContact(prisonerId, name, mobile, relation)
                showAddDialog = false
            }
        )
    }

    // Edit Dialog
    showEditDialog?.let { contact ->
        EditContactDialog(
            contact = contact,
            onDismiss = { showEditDialog = null },
            onConfirm = { name, mobile, relation ->
                viewModel.editContact(contact.contactId, prisonerId, name, mobile, relation)
                showEditDialog = null
            }
        )
    }

    // Delete Confirmation
    showDeleteConfirm?.let { contact ->
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = null },
            title = { Text("Delete Contact") },
            text = { Text("Are you sure you want to delete ${contact.displayName}?") },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.deleteContact(contact.contactId, prisonerId)
                        showDeleteConfirm = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Red)
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = null }) { Text("Cancel") }
            }
        )
    }
}

@Composable
fun ContactsList(
    contacts: List<VerifiedContact>,
    onToggleStatus: (String, Boolean) -> Unit,
    onEdit: (VerifiedContact) -> Unit,
    onDelete: (VerifiedContact) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(contacts, key = { it.contactId }) { contact ->
            ContactItem(contact, onToggleStatus, onEdit, onDelete)
        }
    }
}

@Composable
fun ContactItem(
    contact: VerifiedContact,
    onToggleStatus: (String, Boolean) -> Unit,
    onEdit: (VerifiedContact) -> Unit,
    onDelete: (VerifiedContact) -> Unit
) {
    // Optimistic local state for toggle — prevents snap-back
    var localActive by remember(contact.contactId) { mutableStateOf(contact.active) }
    LaunchedEffect(contact.active) { localActive = contact.active }

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
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(contact.displayName, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(contact.phone, color = Color.Gray, fontSize = 14.sp)
                Text(contact.relationship ?: "Contact", color = Color(0xFF003366), fontSize = 12.sp)
            }
            IconButton(onClick = { onEdit(contact) }) {
                Icon(Icons.Default.Edit, contentDescription = "Edit", tint = Color(0xFF666666))
            }
            IconButton(onClick = { onDelete(contact) }) {
                Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color.Red)
            }
            Switch(
                checked = localActive,
                onCheckedChange = { newValue ->
                    localActive = newValue
                    onToggleStatus(contact.contactId, newValue)
                }
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
    var nameError by remember { mutableStateOf(false) }
    var mobileError by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Verified Contact") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; nameError = false },
                    label = { Text("Full Name *") },
                    isError = nameError,
                    singleLine = true
                )
                if (nameError) Text("Name is required", color = Color(0xFFD32F2F), fontSize = 12.sp)
                OutlinedTextField(
                    value = mobile,
                    onValueChange = { mobile = it; mobileError = false },
                    label = { Text("Mobile Number *") },
                    isError = mobileError,
                    singleLine = true
                )
                if (mobileError) Text("Mobile number is required", color = Color(0xFFD32F2F), fontSize = 12.sp)
                OutlinedTextField(
                    value = relation,
                    onValueChange = { relation = it },
                    label = { Text("Relationship") },
                    singleLine = true
                )
            }
        },
        confirmButton = {
            Button(onClick = {
                nameError = name.isBlank()
                mobileError = mobile.isBlank()
                if (!nameError && !mobileError) {
                    onConfirm(name.trim(), mobile.trim(), relation.trim())
                }
            }) { Text("Add") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun EditContactDialog(
    contact: VerifiedContact,
    onDismiss: () -> Unit,
    onConfirm: (String, String, String) -> Unit
) {
    var name by remember { mutableStateOf(contact.displayName) }
    var mobile by remember { mutableStateOf(contact.phone) }
    var relation by remember { mutableStateOf(contact.relationship ?: "") }
    var nameError by remember { mutableStateOf(false) }
    var mobileError by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Contact") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; nameError = false },
                    label = { Text("Full Name *") },
                    isError = nameError,
                    singleLine = true
                )
                if (nameError) Text("Name is required", color = Color(0xFFD32F2F), fontSize = 12.sp)
                OutlinedTextField(
                    value = mobile,
                    onValueChange = { mobile = it; mobileError = false },
                    label = { Text("Mobile Number *") },
                    isError = mobileError,
                    singleLine = true
                )
                if (mobileError) Text("Mobile number is required", color = Color(0xFFD32F2F), fontSize = 12.sp)
                OutlinedTextField(
                    value = relation,
                    onValueChange = { relation = it },
                    label = { Text("Relationship") },
                    singleLine = true
                )
            }
        },
        confirmButton = {
            Button(onClick = {
                nameError = name.isBlank()
                mobileError = mobile.isBlank()
                if (!nameError && !mobileError) {
                    onConfirm(name.trim(), mobile.trim(), relation.trim())
                }
            }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
