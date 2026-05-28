package com.example.desktopcal.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import com.example.desktopcal.data.KIND_DURATION
import com.example.desktopcal.data.KIND_EVENT
import com.example.desktopcal.data.MobileEntry
import com.example.desktopcal.data.kindLabels
import com.example.desktopcal.data.todayKey
import com.example.desktopcal.data.unitLabels
import com.example.desktopcal.theme.DesktopCalTheme

@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit,
  modifier: Modifier = Modifier,
  viewModel: MainScreenViewModel = viewModel(),
) {
  MainScreen(
    state = viewModel.uiState,
    onTokenChange = viewModel::updateToken,
    onSaveToken = viewModel::saveTokenAndRefresh,
    onRefresh = viewModel::refresh,
    onTitleChange = viewModel::updateDraftTitle,
    onDateChange = viewModel::updateDraftDate,
    onTimeChange = viewModel::updateDraftTime,
    onUnitChange = viewModel::updateDraftUnit,
    onKindChange = viewModel::updateDraftKind,
    onImportanceChange = viewModel::updateDraftImportance,
    onCreate = viewModel::createEntry,
    modifier = modifier,
  )
}

@Composable
internal fun MainScreen(
  state: MainScreenUiState,
  onTokenChange: (String) -> Unit,
  onSaveToken: () -> Unit,
  onRefresh: () -> Unit,
  onTitleChange: (String) -> Unit,
  onDateChange: (String) -> Unit,
  onTimeChange: (String) -> Unit,
  onUnitChange: (String) -> Unit,
  onKindChange: (String) -> Unit,
  onImportanceChange: (Int) -> Unit,
  onCreate: () -> Unit,
  modifier: Modifier = Modifier,
) {
  Column(modifier = modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    Text("DesktopCal Android", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
    Text("连接同一张 c8table，手机端先支持查看和快速新增。", style = MaterialTheme.typography.bodyMedium)

    if (state.isLoading) {
      LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
    }

    ConnectionCard(
      token = state.token,
      lastSyncText = state.lastSyncText,
      onTokenChange = onTokenChange,
      onSaveToken = onSaveToken,
      onRefresh = onRefresh,
    )

    QuickCreateCard(
      state = state,
      onTitleChange = onTitleChange,
      onDateChange = onDateChange,
      onTimeChange = onTimeChange,
      onUnitChange = onUnitChange,
      onKindChange = onKindChange,
      onImportanceChange = onImportanceChange,
      onCreate = onCreate,
    )

    state.error?.let {
      Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
    }

    Text("近期事件", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
      items(state.entries) { entry ->
        EntryRow(entry)
      }
    }
  }
}

@Composable
private fun ConnectionCard(
  token: String,
  lastSyncText: String,
  onTokenChange: (String) -> Unit,
  onSaveToken: () -> Unit,
  onRefresh: () -> Unit,
) {
  ElevatedCard(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Text("c8table", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
      OutlinedTextField(
        value = token,
        onValueChange = onTokenChange,
        label = { Text("API token") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.fillMaxWidth(),
      )
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(onClick = onSaveToken) { Text("保存并同步") }
        Button(onClick = onRefresh) { Text("刷新") }
      }
      Text(lastSyncText, style = MaterialTheme.typography.bodySmall)
    }
  }
}

@Composable
private fun QuickCreateCard(
  state: MainScreenUiState,
  onTitleChange: (String) -> Unit,
  onDateChange: (String) -> Unit,
  onTimeChange: (String) -> Unit,
  onUnitChange: (String) -> Unit,
  onKindChange: (String) -> Unit,
  onImportanceChange: (Int) -> Unit,
  onCreate: () -> Unit,
) {
  ElevatedCard(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Text("快速新增", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
      OutlinedTextField(
        value = state.draftTitle,
        onValueChange = onTitleChange,
        label = { Text("标题") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
      )
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(
          value = state.draftDate,
          onValueChange = onDateChange,
          label = { Text("日期") },
          singleLine = true,
          modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
          value = state.draftTime,
          onValueChange = onTimeChange,
          label = { Text("时间") },
          singleLine = true,
          modifier = Modifier.weight(1f),
        )
      }
      ChipGroup("来源", unitLabels, state.draftUnit, onUnitChange)
      ChipGroup("类型", kindLabels, state.draftKind, onKindChange)
      FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        (1..5).forEach { level ->
          FilterChip(
            selected = state.draftImportance == level,
            onClick = { onImportanceChange(level) },
            label = { Text("${level}星") },
          )
        }
      }
      Button(onClick = onCreate, modifier = Modifier.fillMaxWidth()) { Text("新增到 c8table") }
    }
  }
}

@Composable
private fun ChipGroup(
  title: String,
  values: List<String>,
  selected: String,
  onSelected: (String) -> Unit,
) {
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      values.forEach { value ->
        FilterChip(selected = selected == value, onClick = { onSelected(value) }, label = { Text(value) })
      }
    }
  }
}

@Composable
private fun EntryRow(entry: MobileEntry) {
  Card(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        Text(markerFor(entry.unit, entry.kind), color = MaterialTheme.colorScheme.primary)
        Text(entry.title, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Text("L${entry.importance}", style = MaterialTheme.typography.bodySmall)
      }
      Text(
        listOf(entry.date, entry.time, entry.unit, entry.kind).filter { it.isNotBlank() }.joinToString("  "),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      if (entry.note.isNotBlank()) {
        Text(entry.note, style = MaterialTheme.typography.bodySmall)
      }
    }
  }
}

private fun markerFor(unit: String, kind: String): String {
  val solid = kind == KIND_DURATION
  return when (unit) {
    "科研" -> if (solid) "●" else "○"
    "评审" -> if (solid) "■" else "□"
    "个人" -> if (solid) "◆" else "◇"
    "其他" -> if (solid) "⬢" else "⬡"
    else -> if (solid) "▲" else "△"
  }
}

@Preview(showBackground = true, widthDp = 390)
@Composable
fun MainScreenPreview() {
  DesktopCalTheme {
    MainScreen(
      state = MainScreenUiState(
        lastSyncText = "已同步 2 条",
        draftDate = todayKey(),
        entries = listOf(
          MobileEntry("1", "中央巡检", todayKey(), "15:30", "单位", KIND_DURATION, 5, ""),
          MobileEntry("2", "组会", todayKey(), "09:00", "科研", KIND_EVENT, 3, "带材料"),
        ),
      ),
      onTokenChange = {},
      onSaveToken = {},
      onRefresh = {},
      onTitleChange = {},
      onDateChange = {},
      onTimeChange = {},
      onUnitChange = {},
      onKindChange = {},
      onImportanceChange = {},
      onCreate = {},
    )
  }
}
