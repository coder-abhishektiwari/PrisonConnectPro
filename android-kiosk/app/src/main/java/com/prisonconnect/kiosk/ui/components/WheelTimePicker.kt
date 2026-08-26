package com.prisonconnect.kiosk.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlin.math.abs

private val PrimaryNavy = Color(0xFF003366)
private val SelectedBg = Color(0xFFE8EDF4)
private val DividerColor = Color(0xFFCBD5E1)

@Composable
fun WheelTimePicker(
    initialHour: Int = 9,
    initialMinute: Int = 0,
    initialIsPm: Boolean = false,
    onTimeSelected: (hour: Int, minute: Int, isPm: Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val hours = (1..12).toList()
    val minutes = (0..59).toList()
    val periods = listOf(false, true) // AM, PM

    var selectedHour by remember { mutableStateOf(initialHour.coerceIn(1, 12)) }
    var selectedMinute by remember { mutableStateOf(initialMinute.coerceIn(0, 59)) }
    var selectedIsPm by remember { mutableStateOf(initialIsPm) }

    val scope = rememberCoroutineScope()

    LaunchedEffect(selectedHour, selectedMinute, selectedIsPm) {
        onTimeSelected(selectedHour, selectedMinute, selectedIsPm)
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Picker columns
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFFF8FAFC))
                .padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Hours
            WheelColumn(
                items = hours.map { "%2d".format(it) },
                selectedIndex = hours.indexOf(selectedHour).coerceAtLeast(0),
                onItemSelected = { idx -> selectedHour = hours[idx] },
                modifier = Modifier.weight(1f)
            )

            Text(
                text = ":",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = PrimaryNavy,
                modifier = Modifier.padding(horizontal = 4.dp)
            )

            // Minutes
            WheelColumn(
                items = minutes.map { "%02d".format(it) },
                selectedIndex = minutes.indexOf(selectedMinute).coerceAtLeast(0),
                onItemSelected = { idx -> selectedMinute = minutes[idx] },
                modifier = Modifier.weight(1f)
            )

            // AM/PM
            WheelColumn(
                items = listOf("AM", "PM"),
                selectedIndex = if (selectedIsPm) 1 else 0,
                onItemSelected = { idx -> selectedIsPm = idx == 1 },
                modifier = Modifier.weight(0.8f)
            )
        }
    }
}

@Composable
private fun WheelColumn(
    items: List<String>,
    selectedIndex: Int,
    onItemSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = selectedIndex)
    val itemCount = items.size

    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .collect { idx ->
                val centerOffset = if (idx < itemCount) {
                    val itemInfo = listState.layoutInfo.visibleItemsInfo.find { it.index == idx }
                    itemInfo?.let {
                        val viewportCenter = (listState.layoutInfo.viewportEndOffset + listState.layoutInfo.viewportStartOffset) / 2
                        abs(it.offset + it.size / 2 - viewportCenter)
                    } ?: Int.MAX_VALUE
                } else Int.MAX_VALUE

                if (centerOffset < 60) {
                    onItemSelected(idx)
                }
            }
    }

    Box(modifier = modifier) {
        // Selection indicator
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp)
                .height(48.dp)
                .align(Alignment.Center)
                .clip(RoundedCornerShape(10.dp))
                .background(SelectedBg)
        )

        // Top/bottom fade indicators
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .align(Alignment.TopCenter)
                .background(DividerColor.copy(alpha = 0.5f))
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .align(Alignment.BottomCenter)
                .background(DividerColor.copy(alpha = 0.5f))
        )

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(vertical = 66.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            items(itemCount) { idx ->
                val isSelected = idx == selectedIndex
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = items[idx],
                        fontSize = if (isSelected) 22.sp else 18.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                        color = if (isSelected) PrimaryNavy else Color(0xFF94A3B8),
                    )
                }
            }
        }
    }
}
