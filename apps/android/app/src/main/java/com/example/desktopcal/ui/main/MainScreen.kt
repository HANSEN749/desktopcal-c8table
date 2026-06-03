package com.example.desktopcal.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import com.example.desktopcal.data.CATEGORY_CALENDAR
import com.example.desktopcal.data.CATEGORY_TODO
import com.example.desktopcal.data.KIND_DURATION
import com.example.desktopcal.data.KIND_EVENT
import com.example.desktopcal.data.MobileEntry
import com.example.desktopcal.data.todayKey
import com.example.desktopcal.theme.DesktopCalTheme
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay

@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit,
  modifier: Modifier = Modifier,
  viewModel: MainScreenViewModel = viewModel(),
) {
  MainScreen(
    state = viewModel.uiState,
    onRefresh = viewModel::refresh,
    onQuickTextChange = viewModel::updateQuickText,
    onQuickCreate = viewModel::createQuickEntry,
    modifier = modifier,
  )
}

@Composable
internal fun MainScreen(
  state: MainScreenUiState,
  onRefresh: () -> Unit,
  onQuickTextChange: (String) -> Unit,
  onQuickCreate: (String) -> Unit,
  modifier: Modifier = Modifier,
) {
  var now by remember { mutableStateOf(Date()) }
  LaunchedEffect(Unit) {
    while (true) {
      delay(60_000)
      now = Date()
    }
  }
  val nextEntry = remember(state.entries, now) { nextFutureCalendarEntry(state.entries, now) }
  val pendingTodos = remember(state.entries) { pendingTodoEntries(state.entries) }
  val calendarEntries = remember(state.entries) { calendarEntries(state.entries) }
  var selectedTab by remember { mutableStateOf(AndroidHomeTab.Overview) }

  Column(modifier = modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    Text("DesktopCal Android", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
    Text("查看和新增已同步的日历、待办。OAuth 与数据源由桌面/Web 统一管理。", style = MaterialTheme.typography.bodyMedium)

    if (state.isLoading) {
      LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
    }

    state.error?.let {
      Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
      when (selectedTab) {
        AndroidHomeTab.Overview -> {
          item {
            QuickCaptureCard(
              text = state.quickText,
              onTextChange = onQuickTextChange,
              onCreateCalendar = { onQuickCreate(CATEGORY_CALENDAR) },
              onCreateTodo = { onQuickCreate(CATEGORY_TODO) },
            )
          }
          item { NextEventStrip(nextEntry, now) }
          item { SectionTitle("最近待办", "+ 待办") { onQuickCreate(CATEGORY_TODO) } }
          if (pendingTodos.isEmpty()) {
            item { EmptyStateText("暂无未完成待办") }
          } else {
            items(pendingTodos.take(5)) { entry -> EntryRow(entry) }
          }
          item { SectionTitle("最近日历", "+ 日历", Modifier.padding(top = 8.dp)) { onQuickCreate(CATEGORY_CALENDAR) } }
          if (calendarEntries.isEmpty()) {
            item { EmptyStateText("暂无近期日历事件") }
          } else {
            items(calendarEntries.take(5)) { entry -> EntryRow(entry) }
          }
        }

        AndroidHomeTab.Calendar -> {
          item { SectionTitle("日历", "+ 日历") { onQuickCreate(CATEGORY_CALENDAR) } }
          item {
            QuickCaptureCard(
              text = state.quickText,
              onTextChange = onQuickTextChange,
              onCreateCalendar = { onQuickCreate(CATEGORY_CALENDAR) },
              onCreateTodo = { onQuickCreate(CATEGORY_TODO) },
            )
          }
          if (calendarEntries.isEmpty()) {
            item { EmptyStateText("暂无日历事件") }
          } else {
            items(calendarEntries) { entry -> EntryRow(entry) }
          }
        }

        AndroidHomeTab.Todos -> {
          item { SectionTitle("待办", "+ 待办") { onQuickCreate(CATEGORY_TODO) } }
          item {
            QuickCaptureCard(
              text = state.quickText,
              onTextChange = onQuickTextChange,
              onCreateCalendar = { onQuickCreate(CATEGORY_CALENDAR) },
              onCreateTodo = { onQuickCreate(CATEGORY_TODO) },
            )
          }
          if (pendingTodos.isEmpty()) {
            item { EmptyStateText("暂无未完成待办") }
          } else {
            items(pendingTodos) { entry -> EntryRow(entry) }
          }
        }

        AndroidHomeTab.Settings -> {
          item { SyncStatusRow(lastSyncText = state.lastSyncText, onRefresh = onRefresh) }
          item {
            SettingsInfoCard()
          }
        }
      }
    }

    NavigationBar(modifier = Modifier.fillMaxWidth()) {
      AndroidHomeTab.entries.forEach { tab ->
        NavigationBarItem(
          selected = selectedTab == tab,
          onClick = { selectedTab = tab },
          label = { Text(tab.label) },
          icon = { Text(tab.icon) },
        )
      }
    }
  }
}

private enum class AndroidHomeTab(val label: String, val icon: String) {
  Overview("总览", "◎"),
  Calendar("日历", "□"),
  Todos("待办", "●"),
  Settings("设置", "⚙"),
}

@Composable
private fun QuickCaptureCard(
  text: String,
  onTextChange: (String) -> Unit,
  onCreateCalendar: () -> Unit,
  onCreateTodo: () -> Unit,
) {
  ElevatedCard(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Text("自然添加", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
      OutlinedTextField(
        value = text,
        onValueChange = onTextChange,
        label = { Text("例如：明天15:00 AI考试 / 待办 整理发票") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
      )
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        Button(onClick = onCreateCalendar, modifier = Modifier.weight(1f)) { Text("+ 日历") }
        Button(onClick = onCreateTodo, modifier = Modifier.weight(1f)) { Text("+ 待办") }
      }
    }
  }
}

@Composable
private fun SyncStatusRow(
  lastSyncText: String,
  onRefresh: () -> Unit,
) {
  ElevatedCard(modifier = Modifier.fillMaxWidth()) {
    Row(
      modifier = Modifier.fillMaxWidth().padding(12.dp),
      horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text("同步状态", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(lastSyncText, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
      }
      Button(onClick = onRefresh) { Text("刷新") }
    }
  }
}

@Composable
private fun SectionTitle(
  title: String,
  actionText: String,
  modifier: Modifier = Modifier,
  onAdd: () -> Unit,
) {
  Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
    Button(onClick = onAdd) { Text(actionText) }
  }
}

@Composable
private fun EmptyStateText(text: String) {
  Card(modifier = Modifier.fillMaxWidth()) {
    Text(
      text,
      modifier = Modifier.padding(12.dp),
      style = MaterialTheme.typography.bodyMedium,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
  }
}

@Composable
private fun SettingsInfoCard() {
  ElevatedCard(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text("配置入口", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
      Text(
        "账号、OAuth、c8table 和同步数据源由桌面/Web 统一配置。Android 端保留同步刷新、日历和待办查看、新增入口。",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }
  }
}

@Composable
private fun NextEventStrip(entry: MobileEntry?, now: Date) {
  Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Text("下一个明确日期事件", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (entry == null) {
      Text("暂无未来事件", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
      return
    }
    Text(entry.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    Text(
      nextEntryDateLabel(entry, now),
      style = MaterialTheme.typography.bodySmall,
      color = MaterialTheme.colorScheme.primary,
      fontWeight = FontWeight.Bold,
    )
  }
}

@Composable
private fun EntryRow(entry: MobileEntry) {
  Card(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        Text(markerFor(entry.category, entry.unit, entry.kind), color = MaterialTheme.colorScheme.primary)
        Text(entry.title, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        if (entry.completed) {
          Text("已完成", style = MaterialTheme.typography.bodySmall)
        }
        Text("L${entry.importance}", style = MaterialTheme.typography.bodySmall)
      }
      Text(
        listOf(entry.date, entry.time, entry.category, entry.unit, entry.kind).filter { it.isNotBlank() }.joinToString("  "),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      if (entry.note.isNotBlank()) {
        Text(entry.note, style = MaterialTheme.typography.bodySmall)
      }
    }
  }
}

private fun pendingTodoEntries(entries: List<MobileEntry>): List<MobileEntry> =
  entries
    .filter { it.category == CATEGORY_TODO && !it.completed }
    .sortedWith(compareByDescending<MobileEntry> { it.importance }.thenBy { it.date }.thenBy { it.title })

private fun calendarEntries(entries: List<MobileEntry>): List<MobileEntry> =
  entries
    .filter { it.category == CATEGORY_CALENDAR }
    .sortedWith(compareBy<MobileEntry> { it.date }.thenBy { it.time.ifBlank { "99:99" } }.thenBy { it.title })

private fun nextFutureCalendarEntry(entries: List<MobileEntry>, now: Date): MobileEntry? {
  val nowDate = dateKey(now)
  val nowTime = timeKey(now)
  return entries
    .sortedWith(compareBy<MobileEntry> { it.date }.thenBy { it.time.ifBlank { "99:99" } }.thenBy { it.title })
    .firstOrNull { entry ->
      entry.category == CATEGORY_CALENDAR &&
        !entry.completed &&
        (entry.date > nowDate || (entry.date == nowDate && entry.time.isNotBlank() && entry.time > nowTime))
    }
}

private fun nextEntryDateLabel(entry: MobileEntry, now: Date): String {
  val today = dateKey(now)
  val tomorrow = dateKey(Date(now.time + 86_400_000))
  val dayLabel = when (entry.date) {
    today -> "今天"
    tomorrow -> "明天"
    else -> entry.date
  }
  return listOf(dayLabel, entry.time).filter { it.isNotBlank() }.joinToString(" ")
}

private fun dateKey(date: Date): String = SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(date)

private fun timeKey(date: Date): String = SimpleDateFormat("HH:mm", Locale.CHINA).format(date)

private fun markerFor(category: String, unit: String, kind: String): String {
  if (category == CATEGORY_TODO) {
    return "●"
  }
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
        lastSyncText = "已同步 4 条",
        draftDate = todayKey(),
        quickText = "明天08:25 AI考试",
        entries = listOf(
          MobileEntry("1", "AI考试", "日历", "2026-06-03", "08:25", "单位", KIND_EVENT, 3, false, ""),
          MobileEntry("2", "会议主题 2026年国产BIM培训", "日历", "2026-06-04", "", "单位", KIND_DURATION, 3, false, ""),
          MobileEntry("3", "整理联系发票", "代办", todayKey(), "", "单位", KIND_EVENT, 3, false, ""),
          MobileEntry("4", "已完成代办", "代办", todayKey(), "", "单位", KIND_EVENT, 2, true, ""),
        ),
      ),
      onRefresh = {},
      onQuickTextChange = {},
      onQuickCreate = {},
    )
  }
}
