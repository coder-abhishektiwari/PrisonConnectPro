package com.prisonconnect.kiosk.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.prisonconnect.kiosk.core.BaseViewModel
import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.core.UiState
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import com.prisonconnect.kiosk.network.NetworkResult
import com.prisonconnect.kiosk.repository.AuthRepository
import com.prisonconnect.kiosk.repository.InmateRepository
import com.prisonconnect.kiosk.ui.components.KioskErrorState
import com.prisonconnect.kiosk.ui.components.KioskLoadingState
import com.prisonconnect.kiosk.ui.theme.LightBg
import com.prisonconnect.kiosk.ui.theme.PrimaryDarkNavy
import com.prisonconnect.kiosk.ui.theme.PrimaryNavy
import com.prisonconnect.kiosk.ui.theme.TextDark
import com.prisonconnect.kiosk.ui.theme.TextGray
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class InmateProfileDetailsViewModel @Inject constructor(
    private val inmateRepository: InmateRepository,
    private val authRepository: AuthRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow<UiState<InmateProfile>>(UiState.Loading)
    val state = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            val inmateId = authRepository.getInmateId() ?: Constants.KIOSK_ID
            if (inmateId.isNullOrBlank() || inmateId == Constants.KIOSK_ID) {
                _state.value = UiState.Error("No active session found. Please login again.")
                return@launch
            }
            // Profile is cached (30s) from the dashboard load, so this is
            // normally instant; a cache miss just waits out one fetch.
            inmateRepository.getProfile(inmateId).collect { result ->
                when (result) {
                    is NetworkResult.Success -> _state.value = UiState.Success(result.data)
                    is NetworkResult.Failure ->
                        _state.value = UiState.Error(result.error?.message ?: "Failed to load details")
                    else -> Unit
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InmateProfileDetailsScreen(
    onBackClick: () -> Unit,
    viewModel: InmateProfileDetailsViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Inmate Details",
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
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
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PrimaryNavy)
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
                    onRetry = { viewModel.load() }
                )
                is UiState.Success -> InmateDetailsContent(profile = s.data)
                else -> Unit
            }
        }
    }
}

@Composable
private fun InmateDetailsContent(profile: InmateProfile) {
    val rfidValue = profile.rfidCardNumber
        ?: if (profile.rfidRegistered) "Registered" else "Not registered"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                AsyncImage(
                    model = profile.photoUrl,
                    contentDescription = null,
                    modifier = Modifier
                        .size(88.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color(0xFFF1F5F9)),
                    contentScale = ContentScale.Crop,
                    placeholder = rememberVectorPainter(Icons.Default.Person),
                    error = rememberVectorPainter(Icons.Default.Person)
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = profile.displayName,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = PrimaryDarkNavy
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Inmate No: ${profile.displayNumber}",
                    fontSize = 13.sp,
                    color = TextGray
                )
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                DetailRow("Facility", profile.facility)
                DetailRow("Gender", titleCase(profile.gender))
                DetailRow("Age", profile.age)
                DetailRow("District", titleCase(profile.district))
                DetailRow("State", titleCase(profile.state))
                DetailRow("Religion", titleCase(profile.religion))
                DetailRow("Nationality", titleCase(profile.nationality))
                DetailRow("RFID Card", rfidValue)
                DetailRow("Date of Admission", formatAdmissionDate(profile.dateOfAdmission))
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String?) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = TextGray
        )
        Spacer(modifier = Modifier.height(3.dp))
        Text(
            text = value?.takeIf { it.isNotBlank() } ?: "—",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = TextDark
        )
    }
}

private fun titleCase(value: String?): String? =
    value?.takeIf { it.isNotBlank() }?.replaceFirstChar { c ->
        if (c.isLowerCase()) c.titlecase() else c.toString()
    }

private fun formatAdmissionDate(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    return try {
        if (Regex("""\d{4}-\d{2}-\d{2}""").matches(raw)) {
            val parsed = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).parse(raw)
            if (parsed != null) {
                java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.getDefault()).format(parsed)
            } else raw
        } else raw
    } catch (_: Exception) {
        raw
    }
}
