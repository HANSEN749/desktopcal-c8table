package com.example.desktopcal.ui.main

import android.app.Application
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.desktopcal.data.CATEGORY_CALENDAR
import com.example.desktopcal.data.CATEGORY_TODO
import com.example.desktopcal.data.EntryDraft
import com.example.desktopcal.data.KIND_EVENT
import com.example.desktopcal.data.MobileEntry
import com.example.desktopcal.data.TeableRepository
import com.example.desktopcal.data.UNIT_WORK
import com.example.desktopcal.data.todayKey
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlinx.coroutines.launch

class MainScreenViewModel(application: Application) : AndroidViewModel(application) {
  private val prefs = application.getSharedPreferences("desktopcal", Context.MODE_PRIVATE)
  private val repository = TeableRepository()

  var uiState by mutableStateOf(
    MainScreenUiState(
      token = prefs.getString(TOKEN_KEY, "").orEmpty(),
      draftDate = todayKey(),
    ),
  )
    private set

  init {
    if (uiState.token.isNotBlank()) {
      refresh()
    }
  }

  fun updateToken(value: String) {
    uiState = uiState.copy(token = value)
  }

  fun saveTokenAndRefresh() {
    prefs.edit().putString(TOKEN_KEY, uiState.token.trim()).apply()
    refresh()
  }

  fun updateDraftTitle(value: String) {
    uiState = uiState.copy(draftTitle = value)
  }

  fun updateDraftDate(value: String) {
    uiState = uiState.copy(draftDate = value)
  }

  fun updateDraftTime(value: String) {
    uiState = uiState.copy(draftTime = value)
  }

  fun updateDraftUnit(value: String) {
    uiState = uiState.copy(draftUnit = value)
  }

  fun updateDraftKind(value: String) {
    uiState = uiState.copy(draftKind = value)
  }

  fun updateDraftCategory(value: String) {
    uiState = uiState.copy(draftCategory = value)
  }

  fun updateDraftImportance(value: Int) {
    uiState = uiState.copy(draftImportance = value.coerceIn(1, 5))
  }

  fun updateQuickText(value: String) {
    uiState = uiState.copy(quickText = value)
  }

  fun refresh() {
    val token = uiState.token.trim()
    if (token.isBlank()) {
      uiState = uiState.copy(error = "请先保存 c8table API token")
      return
    }
    viewModelScope.launch {
      uiState = uiState.copy(isLoading = true, error = null)
      runCatching { repository.listEntries(token) }
        .onSuccess { entries ->
          uiState = uiState.copy(entries = entries, isLoading = false, lastSyncText = "已同步 ${entries.size} 条")
        }
        .onFailure { error ->
          uiState = uiState.copy(isLoading = false, error = error.message ?: "同步失败")
        }
    }
  }

  fun createEntry() {
    val token = uiState.token.trim()
    val title = uiState.draftTitle.trim()
    if (token.isBlank()) {
      uiState = uiState.copy(error = "请先保存 c8table API token")
      return
    }
    if (title.isBlank()) {
      uiState = uiState.copy(error = "标题不能为空")
      return
    }
    viewModelScope.launch {
      uiState = uiState.copy(isLoading = true, error = null)
      val draft = EntryDraft(
        title = title,
        category = uiState.draftCategory,
        date = uiState.draftDate.trim().ifBlank { todayKey() },
        time = if (uiState.draftCategory == CATEGORY_TODO) "" else uiState.draftTime.trim(),
        unit = uiState.draftUnit,
        kind = if (uiState.draftCategory == CATEGORY_TODO) KIND_EVENT else uiState.draftKind,
        importance = uiState.draftImportance,
      )
      runCatching { repository.createEntry(token, draft) }
        .onSuccess {
          uiState = uiState.copy(draftTitle = "", draftTime = "", isLoading = false)
          refresh()
        }
        .onFailure { error ->
          uiState = uiState.copy(isLoading = false, error = error.message ?: "新增失败")
        }
    }
  }

  fun createQuickEntry(category: String) {
    val token = uiState.token.trim()
    val text = uiState.quickText.trim()
    if (token.isBlank()) {
      uiState = uiState.copy(error = "请先在桌面/Web 完成 c8table OAuth 配置并同步")
      return
    }
    if (text.isBlank()) {
      uiState = uiState.copy(error = "请输入要添加的日历或待办")
      return
    }
    val draft = parseQuickDraft(text, category)
    viewModelScope.launch {
      uiState = uiState.copy(isLoading = true, error = null)
      runCatching { repository.createEntry(token, draft) }
        .onSuccess {
          uiState = uiState.copy(quickText = "", isLoading = false)
          refresh()
        }
        .onFailure { error ->
          uiState = uiState.copy(isLoading = false, error = error.message ?: "新增失败")
        }
    }
  }

  private fun parseQuickDraft(text: String, requestedCategory: String): EntryDraft {
    val inferredTodo = text.contains("待办") || text.contains("代办") || text.contains("任务")
    val category = if (requestedCategory == CATEGORY_TODO || inferredTodo) CATEGORY_TODO else CATEGORY_CALENDAR
    val date = if (category == CATEGORY_TODO) todayKey() else parseQuickDate(text)
    val time = if (category == CATEGORY_TODO) "" else parseQuickTime(text)
    val title = text
      .replace("待办", "")
      .replace("代办", "")
      .replace("任务", "")
      .replace(Regex("""\d{1,2}[:：]\d{2}"""), "")
      .replace(Regex("""(今天|明天|后天|\d{1,2}月\d{1,2}[日号]?)"""), "")
      .trim()
      .ifBlank { text }
    return EntryDraft(
      title = title,
      category = category,
      date = date,
      time = time,
      unit = UNIT_WORK,
      kind = KIND_EVENT,
      importance = when {
        text.contains("紧急") -> 5
        text.contains("重要") -> 4
        else -> 3
      },
    )
  }

  private fun parseQuickDate(text: String): String {
    val calendar = Calendar.getInstance(Locale.CHINA)
    when {
      text.contains("后天") -> calendar.add(Calendar.DATE, 2)
      text.contains("明天") -> calendar.add(Calendar.DATE, 1)
    }
    Regex("""(\d{1,2})月(\d{1,2})(?:日|号)?""").find(text)?.let { match ->
      calendar.set(Calendar.MONTH, match.groupValues[1].toInt() - 1)
      calendar.set(Calendar.DAY_OF_MONTH, match.groupValues[2].toInt())
    }
    return SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(calendar.time)
  }

  private fun parseQuickTime(text: String): String =
    Regex("""(\d{1,2})[:：](\d{2})""").find(text)?.let { match ->
      "${match.groupValues[1].padStart(2, '0')}:${match.groupValues[2]}"
    }.orEmpty()
}

data class MainScreenUiState(
  val token: String = "",
  val entries: List<MobileEntry> = emptyList(),
  val isLoading: Boolean = false,
  val error: String? = null,
  val lastSyncText: String = "未同步",
  val draftTitle: String = "",
  val draftCategory: String = CATEGORY_CALENDAR,
  val draftDate: String = todayKey(),
  val draftTime: String = "",
  val draftUnit: String = UNIT_WORK,
  val draftKind: String = KIND_EVENT,
  val draftImportance: Int = 3,
  val quickText: String = "",
)

private const val TOKEN_KEY = "desktopcal.teable.token"
