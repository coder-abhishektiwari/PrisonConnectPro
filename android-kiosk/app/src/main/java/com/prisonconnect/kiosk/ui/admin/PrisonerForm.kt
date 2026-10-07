package com.prisonconnect.kiosk.ui.admin

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.prisonconnect.kiosk.models.admin.Prisoner
import com.prisonconnect.kiosk.models.admin.PrisonerFormValues
import com.prisonconnect.kiosk.ui.components.KioskDateField
import com.prisonconnect.kiosk.ui.components.KioskSelectField

val ID_PROOF_OPTIONS = listOf("Aadhaar Card", "Voter ID", "PAN Card")
val RELIGION_OPTIONS = listOf("Hindu", "Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Other")
val NATIONALITY_OPTIONS = listOf("Indian", "Other")
val STATE_OPTIONS = listOf(
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
    "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
)

/**
 * Editable state shared by the add and edit prisoner screens so both collect
 * exactly the same fields, in the same order, with the same widgets.
 */
class PrisonerFormState(initial: Prisoner?) {
    var fullName by mutableStateOf(initial?.displayName ?: "")
    var gender by mutableStateOf(initial?.gender ?: "male")
    var age by mutableStateOf(initial?.age?.toString() ?: "")
    var dateOfAdmission by mutableStateOf(initial?.dateOfAdmission ?: "")
    var fatherName by mutableStateOf(initial?.fatherName ?: "")
    var motherName by mutableStateOf(initial?.motherName ?: "")
    var idProof by mutableStateOf(initial?.idProof ?: "")
    var idNumber by mutableStateOf(initial?.idNumber ?: "")
    var religion by mutableStateOf(initial?.religion ?: "")
    var nationality by mutableStateOf(initial?.nationality ?: "")
    var state by mutableStateOf(initial?.state ?: "")
    var district by mutableStateOf(initial?.district ?: "")
    var address by mutableStateOf(initial?.address ?: "")
    var prisonerNumber by mutableStateOf(initial?.prisonerNumber ?: "")
    var assignedKioskId by mutableStateOf(initial?.assignedKioskId ?: "")
    var active by mutableStateOf(initial?.active ?: true)

    fun toValues(): PrisonerFormValues = PrisonerFormValues(
        name = fullName.trim(),
        gender = gender.ifBlank { null },
        age = age.trim().ifBlank { null },
        dateOfAdmission = dateOfAdmission.ifBlank { null },
        fatherName = fatherName.trim().ifBlank { null },
        motherName = motherName.trim().ifBlank { null },
        idProof = idProof.ifBlank { null },
        idNumber = idNumber.trim().ifBlank { null },
        religion = religion.ifBlank { null },
        nationality = nationality.ifBlank { null },
        state = state.ifBlank { null },
        district = district.trim().ifBlank { null },
        address = address.trim().ifBlank { null },
        prisonerNumber = prisonerNumber.trim()
    )
}

@Composable
private fun FormCard(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = title,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0B2240)
            )
            content()
        }
    }
}

@Composable
private fun GenderPill(
    label: String,
    value: String,
    selectedValue: String,
    onSelect: (String) -> Unit,
    color: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = { onSelect(value) },
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = if (selectedValue == value) color else Color.White,
        border = BorderStroke(1.dp, if (selectedValue == value) color else Color(0xFFE2E8F0))
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(vertical = 16.dp),
            textAlign = TextAlign.Center,
            fontWeight = if (selectedValue == value) FontWeight.Bold else FontWeight.Normal,
            color = if (selectedValue == value) Color.White else Color(0xFF0B2240)
        )
    }
}

/**
 * The prisoner fields shared by add and edit: one scrollable set of cards,
 * dropdowns for choices and a date picker for the admission date.
 */
@Composable
fun PrisonerDetailsFields(state: PrisonerFormState) {
    FormCard("Personal Details") {
        OutlinedTextField(
            value = state.fullName,
            onValueChange = { state.fullName = it },
            label = { Text("Prisoner Name *") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Text(
            text = "Gender *",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF0B2240)
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            GenderPill("Male", "male", state.gender, { state.gender = it }, Color(0xFF003366), Modifier.weight(1f))
            GenderPill("Female", "female", state.gender, { state.gender = it }, Color(0xFFC2185B), Modifier.weight(1f))
            GenderPill("Other", "other", state.gender, { state.gender = it }, Color(0xFF7B1FA2), Modifier.weight(1f))
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedTextField(
                value = state.age,
                onValueChange = { input -> state.age = input.filter { it.isDigit() }.take(3) },
                label = { Text("Age") },
                modifier = Modifier.weight(1f),
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = KeyboardType.Number
                )
            )
            OutlinedTextField(
                value = state.fatherName,
                onValueChange = { state.fatherName = it },
                label = { Text("Father/Husband Name") },
                modifier = Modifier.weight(1f),
                singleLine = true
            )
        }

        OutlinedTextField(
            value = state.motherName,
            onValueChange = { state.motherName = it },
            label = { Text("Mother Name") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
    }

    FormCard("Identity & Admission") {
        KioskSelectField(
            value = state.idProof,
            onValueChange = { state.idProof = it },
            label = "ID Proof",
            options = ID_PROOF_OPTIONS,
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = state.idNumber,
            onValueChange = { state.idNumber = it },
            label = { Text("ID Number") },
            supportingText = { Text("Number of the selected ID proof") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        KioskDateField(
            value = state.dateOfAdmission,
            onValueChange = { state.dateOfAdmission = it },
            label = "Admission Date"
        )

        OutlinedTextField(
            value = state.prisonerNumber,
            onValueChange = { state.prisonerNumber = it },
            label = { Text("Inmate Number") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
    }

    FormCard("Address Details") {
        KioskSelectField(
            value = state.religion,
            onValueChange = { state.religion = it },
            label = "Religion",
            options = RELIGION_OPTIONS,
            modifier = Modifier.fillMaxWidth()
        )

        KioskSelectField(
            value = state.nationality,
            onValueChange = { state.nationality = it },
            label = "Nationality",
            options = NATIONALITY_OPTIONS,
            modifier = Modifier.fillMaxWidth()
        )

        KioskSelectField(
            value = state.state,
            onValueChange = { state.state = it },
            label = "State",
            options = STATE_OPTIONS,
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = state.district,
            onValueChange = { state.district = it },
            label = { Text("District") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = state.address,
            onValueChange = { state.address = it },
            label = { Text("Address") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 2,
            maxLines = 4
        )
    }
}
