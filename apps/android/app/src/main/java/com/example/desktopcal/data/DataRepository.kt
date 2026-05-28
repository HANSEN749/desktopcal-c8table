package com.example.desktopcal.data

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

const val DEFAULT_TEABLE_BASE_URL = "https://c8table.com"
const val DEFAULT_TEABLE_TABLE_ID = "tbl2wWI7diI2vs5anMs"

data class MobileEntry(
  val id: String,
  val title: String,
  val date: String,
  val time: String,
  val unit: String,
  val kind: String,
  val importance: Int,
  val note: String,
)

data class EntryDraft(
  val title: String,
  val date: String,
  val time: String,
  val unit: String,
  val kind: String,
  val importance: Int,
)

class TeableRepository(
  private val baseUrl: String = DEFAULT_TEABLE_BASE_URL,
  private val tableId: String = DEFAULT_TEABLE_TABLE_ID,
) {
  suspend fun listEntries(token: String): List<MobileEntry> =
    withContext(Dispatchers.IO) {
      ensureFields(token)
      val body = request(
        token = token,
        url = "$baseUrl/api/table/$tableId/record?fieldKeyType=name&cellFormat=json&take=1000",
      )
      val records = JSONObject(body).optJSONArray("records") ?: JSONArray()
      buildList {
        for (index in 0 until records.length()) {
          val record = records.optJSONObject(index) ?: continue
          parseRecord(record)?.let(::add)
        }
      }.sortedWith(compareBy<MobileEntry> { it.date }.thenBy { it.time }.thenBy { it.title })
    }

  suspend fun createEntry(token: String, draft: EntryDraft): MobileEntry =
    withContext(Dispatchers.IO) {
      ensureFields(token)
      val now = isoNow()
      val fields = JSONObject()
        .put(FIELD_TITLE, draft.title)
        .put(FIELD_DATE, draft.date)
        .put(FIELD_TIME, draft.time.ifBlank { JSONObject.NULL })
        .put(FIELD_UNIT, draft.unit)
        .put(FIELD_KIND, draft.kind)
        .put(FIELD_IMPORTANCE, draft.importance)
        .put(FIELD_NOTE, JSONObject.NULL)
        .put(FIELD_ATTACHMENT_META, "[]")
        .put(FIELD_LOCAL_ID, UUID.randomUUID().toString())
        .put(FIELD_CREATED_AT, now)
        .put(FIELD_UPDATED_AT, now)
        .put(LEGACY_TEXT_FIELD, draft.title)
      val payload = JSONObject()
        .put("fieldKeyType", "name")
        .put("typecast", true)
        .put("records", JSONArray().put(JSONObject().put("fields", fields)))
      val body = request(
        token = token,
        url = "$baseUrl/api/table/$tableId/record",
        method = "POST",
        jsonBody = payload,
      )
      val record = JSONObject(body).optJSONArray("records")?.optJSONObject(0)
      parseRecord(record ?: JSONObject()) ?: MobileEntry(
        id = "",
        title = draft.title,
        date = draft.date,
        time = draft.time,
        unit = draft.unit,
        kind = draft.kind,
        importance = draft.importance,
        note = "",
      )
    }

  private fun ensureFields(token: String) {
    val body = request(token = token, url = "$baseUrl/api/table/$tableId/field")
    val fields = JSONArray(body)
    val names = buildSet {
      for (index in 0 until fields.length()) {
        val field = fields.optJSONObject(index) ?: continue
        add(field.optString("name"))
      }
    }
    for (field in requiredFields) {
      if (field.name in names) {
        continue
      }
      try {
        createField(token, field, field.type)
      } catch (error: IOException) {
        val fallback = field.fallbackType ?: throw error
        createField(token, field, fallback)
      }
    }
  }

  private fun createField(token: String, field: RequiredField, type: String) {
    val payload = JSONObject()
      .put("type", type)
      .put("name", field.name)
      .put("dbFieldName", field.dbFieldName)
      .put("description", field.description)
    if (type == "date") {
      payload.put(
        "options",
        JSONObject()
          .put(
            "formatting",
            JSONObject()
              .put("date", "YYYY-MM-DD")
              .put("time", "HH:mm")
              .put("timeZone", "Asia/Shanghai"),
          )
          .put("timeZone", "Asia/Shanghai"),
      )
    }
    request(token = token, url = "$baseUrl/api/table/$tableId/field", method = "POST", jsonBody = payload)
  }

  private fun parseRecord(record: JSONObject): MobileEntry? {
    val fields = record.optJSONObject("fields") ?: return null
    val title = fieldText(fields.opt(FIELD_TITLE)) ?: fieldText(fields.opt(LEGACY_TEXT_FIELD)) ?: return null
    return MobileEntry(
      id = record.optString("id"),
      title = title,
      date = fieldText(fields.opt(FIELD_DATE))?.take(10) ?: todayKey(),
      time = fieldText(fields.opt(FIELD_TIME)).orEmpty(),
      unit = fieldText(fields.opt(FIELD_UNIT)) ?: UNIT_WORK,
      kind = fieldText(fields.opt(FIELD_KIND)) ?: KIND_EVENT,
      importance = fieldText(fields.opt(FIELD_IMPORTANCE))?.toIntOrNull()?.coerceIn(1, 5) ?: 3,
      note = fieldText(fields.opt(FIELD_NOTE)).orEmpty(),
    )
  }

  private fun fieldText(value: Any?): String? =
    when (value) {
      null, JSONObject.NULL -> null
      is String -> value.trim().ifBlank { null }
      is Number -> value.toString()
      else -> value.toString().trim().ifBlank { null }
    }

  private fun request(
    token: String,
    url: String,
    method: String = "GET",
    jsonBody: JSONObject? = null,
  ): String {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      requestMethod = method
      connectTimeout = 15_000
      readTimeout = 30_000
      setRequestProperty("Authorization", "Bearer $token")
      if (jsonBody != null) {
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
      }
    }
    if (jsonBody != null) {
      connection.outputStream.use { stream ->
        stream.write(jsonBody.toString().toByteArray(Charsets.UTF_8))
      }
    }
    val code = connection.responseCode
    val stream = if (code in 200..299) connection.inputStream else connection.errorStream
    val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
    if (code !in 200..299) {
      throw IOException("c8table $code: ${text.ifBlank { connection.responseMessage }}")
    }
    return text
  }
}

data class RequiredField(
  val name: String,
  val type: String,
  val dbFieldName: String,
  val description: String,
  val fallbackType: String? = null,
)

val unitLabels = listOf(UNIT_WORK, "科研", "评审", "个人", "其他")
val kindLabels = listOf(KIND_EVENT, KIND_DURATION)

fun todayKey(): String = SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(Date())

fun isoNow(): String {
  val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
  format.timeZone = TimeZone.getTimeZone("UTC")
  return format.format(Date())
}

private const val FIELD_TITLE = "标题"
private const val FIELD_DATE = "日期"
private const val FIELD_TIME = "时间"
private const val FIELD_UNIT = "单位"
private const val FIELD_KIND = "类型"
private const val FIELD_IMPORTANCE = "重要性"
private const val FIELD_NOTE = "备注"
private const val FIELD_ATTACHMENTS = "附件"
private const val FIELD_ATTACHMENT_META = "附件元数据"
private const val FIELD_LOCAL_ID = "本地ID"
private const val FIELD_CREATED_AT = "创建时间"
private const val FIELD_UPDATED_AT = "更新时间"
private const val LEGACY_TEXT_FIELD = "单行文本"

const val UNIT_WORK = "单位"
const val KIND_EVENT = "事件"
const val KIND_DURATION = "持续"

private val requiredFields = listOf(
  RequiredField(FIELD_TITLE, "singleLineText", "desktopcal_title", "事件标题"),
  RequiredField(FIELD_DATE, "date", "desktopcal_date", "事件日期", "singleLineText"),
  RequiredField(FIELD_TIME, "singleLineText", "desktopcal_time", "事件时间，HH:mm"),
  RequiredField(FIELD_UNIT, "singleSelect", "desktopcal_unit", "单位/来源，决定月历显示形状", "singleLineText"),
  RequiredField(FIELD_KIND, "singleSelect", "desktopcal_kind", "事件或持续，决定空心/实心显示", "singleLineText"),
  RequiredField(FIELD_IMPORTANCE, "rating", "desktopcal_importance", "1-5 星重要性", "number"),
  RequiredField(FIELD_NOTE, "longText", "desktopcal_note", "备注"),
  RequiredField(FIELD_ATTACHMENTS, "attachment", "desktopcal_attachments", "事件附件", "longText"),
  RequiredField(FIELD_ATTACHMENT_META, "longText", "desktopcal_attachment_meta", "附件元数据备份"),
  RequiredField(FIELD_LOCAL_ID, "singleLineText", "desktopcal_local_id", "DesktopCal 本地事件标识"),
  RequiredField(FIELD_CREATED_AT, "date", "desktopcal_created_at", "事件创建时间", "singleLineText"),
  RequiredField(FIELD_UPDATED_AT, "date", "desktopcal_updated_at", "事件更新时间", "singleLineText"),
)
