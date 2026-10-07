package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.prisonconnect.kiosk.models.admin.KioskAdmin
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.components.KioskTopBar
import com.prisonconnect.kiosk.ui.theme.PrimaryNavy

private val EMPLOYEE_ID_PATTERN = Regex("^[A-Za-z0-9._-]{3,40}$")
private val EMAIL_PATTERN = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

@Composable
fun KioskAdminsScreen(
    windowSizeClass: WindowSizeClass,
    onBackClick: () -> Unit,
    viewModel: KioskAdminsViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()

    KioskAdminsContent(
        state = state,
        onBackClick = onBackClick,
        onRetry = viewModel::load,
        onCreate = { name, employeeId, email, password ->
            viewModel.create(name, employeeId, email, password)
        },
        onUpdate = { adminId, name, employeeId, email ->
            viewModel.update(adminId, name, employeeId, email)
        },
        onDialogDismissed = viewModel::clearSaveError,
        onMessageShown = viewModel::consumeMessage
    )
}

@Composable
fun KioskAdminsContent(
    state: KioskAdminsViewModel.UiState,
    onBackClick: () -> Unit,
    onRetry: () -> Unit,
    onCreate: (String, String, String?, String) -> Unit,
    onUpdate: (String, String, String, String?) -> Unit,
    onDialogDismissed: () -> Unit,
    onMessageShown: () -> Unit
) {
    var showAddDialog by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<KioskAdmin?>(null) }
    var snackbarMessage by remember { mutableStateOf<String?>(null) }

    // A successful save closes whichever dialog was open and confirms with a snackbar.
    LaunchedEffect(state.message) {
        val message = state.message ?: return@LaunchedEffect
        showAddDialog = false
        editing = null
        snackbarMessage = message
        onMessageShown()
    }

    LaunchedEffect(snackbarMessage) {
        if (snackbarMessage != null) {
            kotlinx.coroutines.delay(3000L)
            snackbarMessage = null
        }
    }

    Scaffold(
        topBar = {
            KioskTopBar(
                title = "Kiosk Admins",
                showBackButton = true,
                onBackClick = onBackClick
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = PrimaryNavy,
                contentColor = Color.White
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add Kiosk Admin")
            }
        },
        snackbarHost = {
            snackbarMessage?.let { message -> Snackbar { Text(message) } }
        },
        containerColor = Color(0xFFF5F7FA)
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
        ) {
            when {
                state.isLoading && state.admins.isEmpty() -> {
                    KioskLoadingState(modifier = Modifier.align(Alignment.Center))
                }
                state.error != null && state.admins.isEmpty() -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = state.error,
                            color = Color(0xFFD32F2F),
                            fontSize = 14.sp
                        )
                        OutlinedButton(onClick = onRetry) { Text("Retry") }
                    }
                }
                state.admins.isEmpty() -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.ManageAccounts,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = Color.LightGray
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("No kiosk admins yet", color = Color.Gray)
                        Text(
                            text = "Tap + to add one",
                            color = Color.Gray,
                            fontSize = 13.sp
                        )
                    }
                }
                else -> {
                    KioskAdminsList(
                        admins = state.admins,
                        onEdit = { editing = it }
                    )
                }
            }
        }
    }

    if (showAddDialog) {
        KioskAdminDialog(
            title = "Add Kiosk Admin",
            initial = null,
            saving = state.isSaving,
            serverError = state.saveError,
            onDismiss = {
                showAddDialog = false
                onDialogDismissed()
            },
            onConfirm = onCreate
        )
    }

    editing?.let { admin ->
        KioskAdminDialog(
            title = "Edit Kiosk Admin",
            initial = admin,
            saving = state.isSaving,
            serverError = state.saveError,
            onDismiss = {
                editing = null
                onDialogDismissed()
            },
            onConfirm = { name, employeeId, email, _ ->
                onUpdate(admin.adminId, name, employeeId, email)
            }
        )
    }
}

@Composable
private fun KioskAdminsList(
    admins: List<KioskAdmin>,
    onEdit: (KioskAdmin) -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(admins, key = { it.adminId }) { admin ->
            KioskAdminRow(admin = admin, onEdit = { onEdit(admin) })
        }
    }
}

@Composable
private fun KioskAdminRow(
    admin: KioskAdmin,
    onEdit: () -> Unit
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
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = Color(0xFF003366)
                    )
                }
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = admin.name,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = Color(0xFF0B2240)
                )
                Text(
                    text = admin.employeeId ?: "-",
                    color = Color(0xFF003366),
                    fontSize = 13.sp
                )
                Text(
                    text = admin.email ?: "-",
                    color = Color(0xFF687A8F),
                    fontSize = 13.sp
                )
            }
            IconButton(onClick = onEdit) {
                Icon(
                    imageVector = Icons.Default.Edit,
                    contentDescription = "Edit",
                    tint = Color(0xFF666666)
                )
            }
        }
    }
}

/**
 * The same four fields the warden panel offers: username + password only on
 * create, name / username / email editable afterwards.
 */
@Composable
private fun KioskAdminDialog(
    title: String,
    initial: KioskAdmin?,
    saving: Boolean,
    serverError: String?,
    onDismiss: () -> Unit,
    onConfirm: (String, String, String?, String) -> Unit
) {
    val isAdd = initial == null
    var name by remember(initial?.adminId) { mutableStateOf(initial?.name ?: "") }
    var employeeId by remember(initial?.adminId) { mutableStateOf(initial?.employeeId ?: "") }
    var email by remember(initial?.adminId) { mutableStateOf(initial?.email ?: "") }
    var password by remember { mutableStateOf("") }

    var nameError by remember { mutableStateOf<String?>(null) }
    var employeeIdError by remember { mutableStateOf<String?>(null) }
    var emailError by remember { mutableStateOf<String?>(null) }
    var passwordError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text(title, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = {
                        name = it
                        nameError = null
                    },
                    label = { Text("Full name *") },
                    placeholder = { Text("e.g. Neha Gupta") },
                    isError = nameError != null,
                    enabled = !saving,
                    singleLine = true
                )
                nameError?.let { Text(it, color = Color(0xFFD32F2F), fontSize = 12.sp) }

                OutlinedTextField(
                    value = employeeId,
                    onValueChange = {
                        employeeId = it
                        employeeIdError = null
                    },
                    label = { Text("Username (employee ID) *") },
                    placeholder = { Text("e.g. empsa003") },
                    isError = employeeIdError != null,
                    enabled = !saving,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Ascii,
                        imeAction = ImeAction.Next
                    )
                )
                employeeIdError?.let { Text(it, color = Color(0xFFD32F2F), fontSize = 12.sp) }
                if (employeeIdError == null) {
                    Text(
                        text = "What the operator types on the kiosk to sign in.",
                        color = Color(0xFF687A8F),
                        fontSize = 12.sp
                    )
                }

                OutlinedTextField(
                    value = email,
                    onValueChange = {
                        email = it
                        emailError = null
                    },
                    label = { Text("Email (optional)") },
                    placeholder = { Text("name@prisonconnect.io") },
                    isError = emailError != null,
                    enabled = !saving,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = if (isAdd) ImeAction.Next else ImeAction.Done
                    )
                )
                emailError?.let { Text(it, color = Color(0xFFD32F2F), fontSize = 12.sp) }

                if (isAdd) {
                    OutlinedTextField(
                        value = password,
                        onValueChange = {
                            password = it
                            passwordError = null
                        },
                        label = { Text("Password *") },
                        placeholder = { Text("At least 6 characters") },
                        isError = passwordError != null,
                        enabled = !saving,
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        )
                    )
                    passwordError?.let { Text(it, color = Color(0xFFD32F2F), fontSize = 12.sp) }
                    Text(
                        text = "Signs in on any kiosk of this prison with username and password.",
                        color = Color(0xFF687A8F),
                        fontSize = 12.sp
                    )
                }

                serverError?.let {
                    Text(it, color = Color(0xFFD32F2F), fontSize = 13.sp)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val trimmedName = name.trim()
                    val trimmedUsername = employeeId.trim()
                    val trimmedEmail = email.trim()

                    nameError = if (trimmedName.isEmpty()) "Name is required" else null
                    employeeIdError = when {
                        trimmedUsername.isEmpty() -> "Username is required"
                        !EMPLOYEE_ID_PATTERN.matches(trimmedUsername) ->
                            "3-40 characters: letters, digits, dot, dash or underscore"
                        else -> null
                    }
                    emailError = when {
                        trimmedEmail.isEmpty() -> null
                        !EMAIL_PATTERN.matches(trimmedEmail) -> "Enter a valid email"
                        else -> null
                    }
                    passwordError = when {
                        !isAdd -> null
                        password.isEmpty() -> "Password is required"
                        password.length < 6 -> "At least 6 characters"
                        else -> null
                    }

                    if (nameError == null && employeeIdError == null &&
                        emailError == null && passwordError == null
                    ) {
                        onConfirm(
                            trimmedName,
                            trimmedUsername,
                            trimmedEmail.ifEmpty { null },
                            password
                        )
                    }
                },
                enabled = !saving
            ) {
                if (saving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = PrimaryNavy
                    )
                } else {
                    Text(if (isAdd) "Add Kiosk Admin" else "Save Changes")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") }
        }
    )
}

@Composable
private fun PreviewKioskAdminsContent() {
    KioskAdminsContent(
        state = KioskAdminsViewModel.UiState(
            isLoading = false,
            admins = listOf(
                KioskAdmin(
                    adminId = "ADMIN-0001",
                    employeeId = "empsa001",
                    name = "Abhishek",
                    email = "abhishek@prisonconnect.com",
                    status = "active"
                )
            )
        ),
        onBackClick = {},
        onRetry = {},
        onCreate = { _, _, _, _ -> },
        onUpdate = { _, _, _, _ -> },
        onDialogDismissed = {},
        onMessageShown = {}
    )
}
