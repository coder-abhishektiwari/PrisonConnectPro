package com.prisonconnect.kiosk.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun LabelValueRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    labelFontSize: TextUnit = 13.sp,
    valueFontSize: TextUnit = 13.sp,
    valueFontWeight: FontWeight = FontWeight.Medium,
    verticalPadding: TextUnit = 4.sp
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = verticalPadding.value.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = labelFontSize,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            fontSize = valueFontSize,
            fontWeight = valueFontWeight
        )
    }
}

@Composable
fun LabelValueRow(
    label: String,
    value: String,
    isTotal: Boolean,
    modifier: Modifier = Modifier,
    isTablet: Boolean = false
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = if (isTotal) (if (isTablet) 15.sp else 13.sp) else (if (isTablet) 13.sp else 11.sp),
            fontWeight = if (isTotal) FontWeight.Bold else FontWeight.Normal
        )
        Text(
            text = value,
            fontSize = if (isTotal) (if (isTablet) 15.sp else 13.sp) else (if (isTablet) 13.sp else 11.sp),
            fontWeight = if (isTotal) FontWeight.Bold else FontWeight.Normal
        )
    }
}
