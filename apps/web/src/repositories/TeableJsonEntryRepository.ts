import type { Entry, EntryAttachment, EntryUnitId, EventKind } from "@desktopcal/shared";
import { entryUnitProfiles, getEntryUnitProfile } from "@desktopcal/shared";
import { toDateKey } from "../domain/date";
import {
  type EntryDraft,
  type EntryRepository,
  createEntryFromDraft,
  sortEntries,
  touchEntry,
} from "./EntryRepository";
import {
  TEABLE_JSON_FIELD_NAME,
  type TeableRecord,
  entryToEnvelope,
  parseTeableRecords,
} from "./entryEnvelope";

export const DEFAULT_TEABLE_BASE_URL = "https://c8table.com";
export const DEFAULT_TEABLE_TABLE_ID = "tbl2wWI7diI2vs5anMs";

export type Fetcher = typeof fetch;

export interface TeableJsonEntryRepositoryOptions {
  baseUrl?: string;
  tableId?: string;
  token: string;
  fieldName?: string;
  fetcher?: Fetcher;
  readLocalAttachmentBlob?: (attachment: EntryAttachment) => Promise<Blob | undefined>;
}

interface TeableListResponse {
  records: TeableRecord[];
}

interface TeableCreateResponse {
  records: TeableRecord[];
}

interface TeableField {
  id: string;
  name: string;
  type: string;
  dbFieldName?: string;
}

interface RequiredField {
  name: string;
  type: string;
  dbFieldName: string;
  description: string;
  fallbackType?: string;
}

type TeableAttachmentCell = {
  id?: string;
  name?: string;
  size?: number;
  mimetype?: string;
  token?: string;
  presignedUrl?: string;
  smThumbnailUrl?: string;
  lgThumbnailUrl?: string;
};

const FIELD = {
  localId: "本地ID",
  title: "标题",
  date: "日期",
  time: "时间",
  unit: "单位",
  kind: "类型",
  importance: "重要性",
  completed: "完成",
  note: "备注",
  attachments: "附件",
  attachmentMeta: "附件元数据",
  createdAt: "创建时间",
  updatedAt: "更新时间",
} as const;

const REQUIRED_FIELDS: RequiredField[] = [
  {
    name: FIELD.title,
    type: "singleLineText",
    dbFieldName: "desktopcal_title",
    description: "事件标题",
  },
  {
    name: FIELD.date,
    type: "date",
    dbFieldName: "desktopcal_date",
    description: "事件日期",
    fallbackType: "singleLineText",
  },
  {
    name: FIELD.time,
    type: "singleLineText",
    dbFieldName: "desktopcal_time",
    description: "事件时间，HH:mm",
  },
  {
    name: FIELD.unit,
    type: "singleSelect",
    dbFieldName: "desktopcal_unit",
    description: "单位/来源，决定月历显示形状",
    fallbackType: "singleLineText",
  },
  {
    name: FIELD.kind,
    type: "singleSelect",
    dbFieldName: "desktopcal_kind",
    description: "事件或持续，决定空心/实心显示",
    fallbackType: "singleLineText",
  },
  {
    name: FIELD.importance,
    type: "rating",
    dbFieldName: "desktopcal_importance",
    description: "1-5 星重要性",
    fallbackType: "number",
  },
  {
    name: FIELD.completed,
    type: "checkbox",
    dbFieldName: "desktopcal_completed",
    description: "事件是否已完成",
    fallbackType: "singleLineText",
  },
  {
    name: FIELD.note,
    type: "longText",
    dbFieldName: "desktopcal_note",
    description: "备注",
  },
  {
    name: FIELD.attachments,
    type: "attachment",
    dbFieldName: "desktopcal_attachments",
    description: "事件附件",
    fallbackType: "longText",
  },
  {
    name: FIELD.attachmentMeta,
    type: "longText",
    dbFieldName: "desktopcal_attachment_meta",
    description: "附件元数据备份",
  },
  {
    name: FIELD.localId,
    type: "singleLineText",
    dbFieldName: "desktopcal_local_id",
    description: "DesktopCal 本地事件标识",
  },
  {
    name: FIELD.createdAt,
    type: "date",
    dbFieldName: "desktopcal_created_at",
    description: "事件创建时间",
    fallbackType: "singleLineText",
  },
  {
    name: FIELD.updatedAt,
    type: "date",
    dbFieldName: "desktopcal_updated_at",
    description: "事件更新时间",
    fallbackType: "singleLineText",
  },
];

const unitLabelToId = new Map<string, EntryUnitId>(
  Object.values(entryUnitProfiles).map((unit) => [unit.label, unit.id]),
);

const kindLabelById: Record<EventKind, string> = {
  event: "事件",
  duration: "持续",
};

const kindIdByLabel = new Map<string, EventKind>([
  ["事件", "event"],
  ["空", "event"],
  ["event", "event"],
  ["持续", "duration"],
  ["实", "duration"],
  ["duration", "duration"],
  ["截止日期", "duration"],
  ["截止", "duration"],
  ["deadline", "duration"],
]);

export class TeableJsonEntryRepository implements EntryRepository {
  private readonly baseUrl: string;
  private readonly tableId: string;
  private readonly token: string;
  private readonly fieldName: string;
  private readonly fetcher: Fetcher;
  private readonly readLocalAttachmentBlob?: (attachment: EntryAttachment) => Promise<Blob | undefined>;
  private fieldsPromise?: Promise<Map<string, TeableField>>;

  constructor(options: TeableJsonEntryRepositoryOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_TEABLE_BASE_URL).replace(/\/$/, "");
    this.tableId = options.tableId ?? DEFAULT_TEABLE_TABLE_ID;
    this.token = options.token;
    this.fieldName = options.fieldName ?? TEABLE_JSON_FIELD_NAME;
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.readLocalAttachmentBlob = options.readLocalAttachmentBlob;
  }

  async list(): Promise<Entry[]> {
    const fields = await this.ensureFields();
    const params = new URLSearchParams({
      fieldKeyType: "name",
      cellFormat: "json",
      take: "1000",
    });
    const response = await this.request<TeableListResponse>(`${this.recordsUrl()}?${params}`);
    const fallbackDate = toDateKey(new Date());
    const entries: Entry[] = [];
    for (const record of response.records ?? []) {
      const structured = this.parseStructuredRecord(record, fallbackDate);
      if (structured) {
        entries.push(structured);
        continue;
      }
      const migrated = parseTeableRecords([record], fallbackDate);
      for (const entry of migrated) {
        entries.push(entry);
        await this.patchStructuredFields(entry, fields);
      }
    }
    return sortEntries(entries);
  }

  async create(draft: EntryDraft): Promise<Entry> {
    const fields = await this.ensureFields();
    const pending = createEntryFromDraft(draft);
    const response = await this.request<TeableCreateResponse>(this.recordsUrl(), {
      method: "POST",
      body: JSON.stringify({
        fieldKeyType: "name",
        typecast: true,
        records: [
          {
            fields: this.entryToStructuredFields(pending, fields),
          },
        ],
      }),
    });
    const createdRecord = response.records?.[0];
    const saved = {
      ...pending,
      id: createdRecord?.id ?? pending.id,
    };
    return this.uploadLocalAttachments(saved, fields);
  }

  async update(entry: Entry): Promise<Entry> {
    const fields = await this.ensureFields();
    const updated = touchEntry(entry);
    const response = await this.request<TeableRecord>(`${this.recordsUrl()}/${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        fieldKeyType: "name",
        typecast: true,
        record: {
          fields: this.entryToStructuredFields(updated, fields),
        },
      }),
    });
    return this.uploadLocalAttachments(
      {
        ...updated,
        id: response.id ?? updated.id,
      },
      fields,
    );
  }

  async delete(id: string): Promise<void> {
    await this.request<void>(`${this.recordsUrl()}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  private async uploadLocalAttachments(
    entry: Entry,
    fields: Map<string, TeableField>,
  ): Promise<Entry> {
    if (!this.readLocalAttachmentBlob) {
      return entry;
    }
    const attachmentField = fields.get(FIELD.attachments);
    if (!attachmentField || attachmentField.type !== "attachment") {
      return entry;
    }
    const localAttachments = entry.attachments.filter(
      (attachment) => attachment.storage === "local" && attachment.localBlobKey,
    );
    if (localAttachments.length === 0) {
      return entry;
    }

    let latestRecord: TeableRecord | undefined;
    for (const attachment of localAttachments) {
      const blob = await this.readLocalAttachmentBlob(attachment);
      if (!blob) {
        continue;
      }
      const formData = new FormData();
      formData.append("file", blob, attachment.name);
      latestRecord = await this.request<TeableRecord>(
        `${this.recordsUrl()}/${encodeURIComponent(entry.id)}/${encodeURIComponent(
          attachmentField.id,
        )}/uploadAttachment`,
        {
          method: "POST",
          body: formData,
          headers: {},
        },
      );
    }
    return latestRecord ? (this.parseStructuredRecord(latestRecord, entry.date) ?? entry) : entry;
  }

  private entryToStructuredFields(
    entry: Entry,
    fields: Map<string, TeableField>,
  ): Record<string, unknown> {
    const unitProfile = getEntryUnitProfile(entry.unit);
    const payload: Record<string, unknown> = {
      [FIELD.title]: entry.title,
      [FIELD.date]: toTeableDate(entry.date),
      [FIELD.time]: entry.time ?? null,
      [FIELD.unit]: unitProfile.label,
      [FIELD.kind]: kindLabelById[entry.kind],
      [FIELD.importance]: entry.importance,
      [FIELD.completed]: entry.completed ?? false,
      [FIELD.note]: entry.note ?? null,
      [FIELD.attachmentMeta]: JSON.stringify(entry.attachments),
      [FIELD.localId]: entry.localId,
      [FIELD.createdAt]: entry.createdAt,
      [FIELD.updatedAt]: entry.updatedAt,
    };
    if (fields.get(FIELD.date)?.type === "date") {
      payload[FIELD.date] = entry.date;
    }
    if (fields.has(this.fieldName)) {
      payload[this.fieldName] = entry.title;
    }
    if (fields.get(FIELD.attachments)?.type !== "attachment") {
      payload[FIELD.attachments] = entry.attachments.map((attachment) => attachment.name).join(", ");
    }
    return payload;
  }

  private async patchStructuredFields(
    entry: Entry,
    fields: Map<string, TeableField>,
  ): Promise<void> {
    await this.request<void>(`${this.recordsUrl()}/${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        fieldKeyType: "name",
        typecast: true,
        record: {
          fields: this.entryToStructuredFields(entry, fields),
        },
      }),
    });
  }

  private parseStructuredRecord(record: TeableRecord, fallbackDate: string): Entry | null {
    const fields = record.fields;
    const primaryText = textFromField(fields[this.fieldName]);
    const title = textFromField(fields[FIELD.title]) ?? (isEnvelopeJson(primaryText) ? undefined : primaryText);
    if (!title) {
      return null;
    }
    const unit = unitFromField(fields[FIELD.unit]);
    const kind = kindFromField(fields[FIELD.kind]);
    const presentation = getEntryUnitProfile(unit);
    const now = new Date().toISOString();
    return {
      id: record.id,
      localId: textFromField(fields[FIELD.localId]) ?? record.id,
      unit,
      title,
      date: dateFromField(fields[FIELD.date]) ?? fallbackDate,
      time: textFromField(fields[FIELD.time]),
      shape: presentation.shape,
      kind,
      importance: importanceFromField(fields[FIELD.importance]),
      completed: completedFromField(fields[FIELD.completed]),
      note: textFromField(fields[FIELD.note]),
      attachments: attachmentsFromFields(fields[FIELD.attachments], fields[FIELD.attachmentMeta]),
      createdAt: isoFromField(fields[FIELD.createdAt]) ?? record.createdTime ?? now,
      updatedAt: isoFromField(fields[FIELD.updatedAt]) ?? record.lastModifiedTime ?? now,
    };
  }

  private async ensureFields(): Promise<Map<string, TeableField>> {
    this.fieldsPromise ??= this.fetchAndCreateFields();
    return this.fieldsPromise;
  }

  private async fetchAndCreateFields(): Promise<Map<string, TeableField>> {
    const fields = await this.listFields();
    for (const required of REQUIRED_FIELDS) {
      if (fields.has(required.name)) {
        continue;
      }
      const created = await this.createFieldWithFallback(required);
      fields.set(created.name, created);
    }
    return fields;
  }

  private async listFields(): Promise<Map<string, TeableField>> {
    const existing = await this.request<TeableField[]>(this.fieldsUrl());
    const list = Array.isArray(existing) ? existing : [];
    return new Map(list.map((field) => [field.name, field]));
  }

  private async createFieldWithFallback(field: RequiredField): Promise<TeableField> {
    try {
      return await this.createField(field, field.type);
    } catch (error) {
      if (!field.fallbackType) {
        throw error;
      }
      return this.createField(field, field.fallbackType);
    }
  }

  private async createField(field: RequiredField, type: string): Promise<TeableField> {
    return this.request<TeableField>(this.fieldsUrl(), {
      method: "POST",
      body: JSON.stringify(createFieldPayload(field, type)),
    });
  }

  private recordsUrl(): string {
    return `${this.baseUrl}/api/table/${encodeURIComponent(this.tableId)}/record`;
  }

  private fieldsUrl(): string {
    return `${this.baseUrl}/api/table/${encodeURIComponent(this.tableId)}/field`;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const isFormData = init.body instanceof FormData;
    const headers: HeadersInit = {
      Authorization: `Bearer ${this.token}`,
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    };
    const response = await this.fetcher(url, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Teable request failed (${response.status}): ${message || response.statusText}`);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

function createFieldPayload(field: RequiredField, type: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type,
    name: field.name,
    dbFieldName: field.dbFieldName,
    description: field.description,
  };
  if (type === "date") {
    payload.options = {
      formatting: {
        date: "YYYY-MM-DD",
        time: "HH:mm",
        timeZone: "Asia/Shanghai",
      },
      timeZone: "Asia/Shanghai",
    };
  }
  return payload;
}

function toTeableDate(date: string): string {
  return date;
}

function textFromField(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

function isEnvelopeJson(value: string | undefined): boolean {
  if (!value || !value.trim().startsWith("{")) {
    return false;
  }
  try {
    const parsed = JSON.parse(value) as { schema?: unknown };
    return parsed.schema === "desktopcal.entry.v1";
  } catch {
    return false;
  }
}

function dateFromField(value: unknown): string | undefined {
  const text = textFromField(value);
  if (!text) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return dateKeyInShanghai(text);
  }
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : undefined;
}

function dateKeyInShanghai(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return lookup.year && lookup.month && lookup.day
    ? `${lookup.year}-${lookup.month}-${lookup.day}`
    : undefined;
}

function isoFromField(value: unknown): string | undefined {
  const text = textFromField(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : undefined;
}

function unitFromField(value: unknown): EntryUnitId {
  const text = textFromField(value);
  if (!text) {
    return "work";
  }
  if (unitLabelToId.has(text)) {
    return unitLabelToId.get(text) ?? "work";
  }
  return Object.prototype.hasOwnProperty.call(entryUnitProfiles, text) ? (text as EntryUnitId) : "work";
}

function kindFromField(value: unknown): EventKind {
  const text = textFromField(value);
  return (text && kindIdByLabel.get(text)) || "event";
}

function importanceFromField(value: unknown): 1 | 2 | 3 | 4 | 5 {
  const number = typeof value === "number" ? value : Number(textFromField(value));
  if (Number.isInteger(number) && number >= 1 && number <= 5) {
    return number as 1 | 2 | 3 | 4 | 5;
  }
  return 3;
}

function completedFromField(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = textFromField(value)?.toLowerCase();
  return text === "true" || text === "yes" || text === "1" || text === "已完成" || text === "完成";
}

function attachmentsFromFields(
  attachmentCell: unknown,
  attachmentMeta: unknown,
): EntryAttachment[] {
  if (Array.isArray(attachmentCell)) {
    return attachmentCell.map((item, index) => teableAttachmentToEntryAttachment(item, index));
  }
  const metaText = textFromField(attachmentMeta);
  if (!metaText) {
    return [];
  }
  try {
    const parsed = JSON.parse(metaText) as unknown;
    return Array.isArray(parsed) ? (parsed as EntryAttachment[]) : [];
  } catch {
    return [];
  }
}

function teableAttachmentToEntryAttachment(
  value: TeableAttachmentCell,
  index: number,
): EntryAttachment {
  const id = value.id ?? value.token ?? `teable-attachment-${index}`;
  return {
    id,
    storage: "teable",
    teableAttachmentId: id,
    name: value.name ?? "attachment",
    mime: value.mimetype ?? "application/octet-stream",
    size: value.size ?? 0,
    createdAt: new Date().toISOString(),
    kind: value.mimetype?.startsWith("image/") ? "image" : "file",
    url: value.presignedUrl,
    thumbUrl: value.smThumbnailUrl ?? value.lgThumbnailUrl,
  };
}
