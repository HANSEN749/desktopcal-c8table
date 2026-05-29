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

export const DEFAULT_FEISHU_BASE_URL = "https://open.feishu.cn";

export type FeishuFetcher = typeof fetch;

export interface FeishuBitableEntryRepositoryOptions {
  baseUrl?: string;
  appToken: string;
  tableId: string;
  accessToken: string;
  fetcher?: FeishuFetcher;
}

interface FeishuRecord {
  record_id: string;
  fields: Record<string, unknown>;
  created_time?: number | string;
  last_modified_time?: number | string;
}

interface FeishuField {
  field_id: string;
  field_name: string;
  type: number;
}

interface FeishuListData<T> {
  items?: T[];
  has_more?: boolean;
  page_token?: string;
}

interface FeishuRecordData {
  record?: FeishuRecord;
}

interface FeishuFieldData {
  field?: FeishuField;
}

interface FeishuResponse<T> {
  code?: number;
  msg?: string;
  data?: T;
}

interface RequiredField {
  name: string;
  type: number;
}

const FEISHU_FIELD_TYPES = {
  text: 1,
  number: 2,
  checkbox: 7,
} as const;

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
  attachmentMeta: "附件元数据",
  createdAt: "创建时间",
  updatedAt: "更新时间",
} as const;

const REQUIRED_FIELDS: RequiredField[] = [
  { name: FIELD.title, type: FEISHU_FIELD_TYPES.text },
  { name: FIELD.date, type: FEISHU_FIELD_TYPES.text },
  { name: FIELD.time, type: FEISHU_FIELD_TYPES.text },
  { name: FIELD.unit, type: FEISHU_FIELD_TYPES.text },
  { name: FIELD.kind, type: FEISHU_FIELD_TYPES.text },
  { name: FIELD.importance, type: FEISHU_FIELD_TYPES.number },
  { name: FIELD.completed, type: FEISHU_FIELD_TYPES.checkbox },
  { name: FIELD.note, type: FEISHU_FIELD_TYPES.text },
  { name: FIELD.attachmentMeta, type: FEISHU_FIELD_TYPES.text },
  { name: FIELD.localId, type: FEISHU_FIELD_TYPES.text },
  { name: FIELD.createdAt, type: FEISHU_FIELD_TYPES.text },
  { name: FIELD.updatedAt, type: FEISHU_FIELD_TYPES.text },
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
  ["截止", "duration"],
  ["deadline", "duration"],
]);

export class FeishuBitableEntryRepository implements EntryRepository {
  private readonly baseUrl: string;
  private readonly appToken: string;
  private readonly tableId: string;
  private readonly accessToken: string;
  private readonly fetcher: FeishuFetcher;
  private fieldsPromise?: Promise<Map<string, FeishuField>>;

  constructor(options: FeishuBitableEntryRepositoryOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_FEISHU_BASE_URL).replace(/\/$/, "");
    this.appToken = options.appToken;
    this.tableId = options.tableId;
    this.accessToken = options.accessToken;
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async list(): Promise<Entry[]> {
    await this.ensureFields();
    const records: FeishuRecord[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ page_size: "500" });
      if (pageToken) {
        params.set("page_token", pageToken);
      }
      const data = await this.request<FeishuListData<FeishuRecord>>(`${this.recordsUrl()}?${params}`);
      records.push(...(data.items ?? []));
      pageToken = data.has_more ? data.page_token : undefined;
    } while (pageToken);

    const fallbackDate = toDateKey(new Date());
    return sortEntries(records.flatMap((record) => this.recordToEntry(record, fallbackDate)));
  }

  async create(draft: EntryDraft): Promise<Entry> {
    await this.ensureFields();
    const pending = createEntryFromDraft(draft);
    const data = await this.request<FeishuRecordData>(this.recordsUrl(), {
      method: "POST",
      body: JSON.stringify({ fields: this.entryToFields(pending) }),
    });
    return {
      ...pending,
      id: data.record?.record_id ?? pending.id,
    };
  }

  async update(entry: Entry): Promise<Entry> {
    await this.ensureFields();
    const updated = touchEntry(entry);
    const data = await this.request<FeishuRecordData>(`${this.recordsUrl()}/${encodeURIComponent(entry.id)}`, {
      method: "PUT",
      body: JSON.stringify({ fields: this.entryToFields(updated) }),
    });
    return {
      ...updated,
      id: data.record?.record_id ?? updated.id,
    };
  }

  async delete(id: string): Promise<void> {
    await this.request<unknown>(`${this.recordsUrl()}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  private entryToFields(entry: Entry): Record<string, unknown> {
    const unitProfile = getEntryUnitProfile(entry.unit);
    return {
      [FIELD.title]: entry.title,
      [FIELD.date]: entry.date,
      [FIELD.time]: entry.time ?? "",
      [FIELD.unit]: unitProfile.label,
      [FIELD.kind]: kindLabelById[entry.kind],
      [FIELD.importance]: entry.importance,
      [FIELD.completed]: entry.completed ?? false,
      [FIELD.note]: entry.note ?? "",
      [FIELD.attachmentMeta]: JSON.stringify(entry.attachments),
      [FIELD.localId]: entry.localId,
      [FIELD.createdAt]: entry.createdAt,
      [FIELD.updatedAt]: entry.updatedAt,
    };
  }

  private recordToEntry(record: FeishuRecord, fallbackDate: string): Entry[] {
    const fields = record.fields ?? {};
    const title = textFromCell(fields[FIELD.title]);
    if (!title) {
      return [];
    }
    const unit = unitFromCell(fields[FIELD.unit]);
    const presentation = getEntryUnitProfile(unit);
    const now = new Date().toISOString();
    return [
      {
        id: record.record_id,
        localId: textFromCell(fields[FIELD.localId]) ?? record.record_id,
        unit,
        title,
        date: dateFromCell(fields[FIELD.date]) ?? fallbackDate,
        time: textFromCell(fields[FIELD.time]),
        shape: presentation.shape,
        kind: kindFromCell(fields[FIELD.kind]),
        importance: importanceFromCell(fields[FIELD.importance]),
        completed: completedFromCell(fields[FIELD.completed]),
        note: textFromCell(fields[FIELD.note]),
        attachments: attachmentsFromCell(fields[FIELD.attachmentMeta]),
        createdAt: isoFromCell(fields[FIELD.createdAt]) ?? timeToIso(record.created_time) ?? now,
        updatedAt: isoFromCell(fields[FIELD.updatedAt]) ?? timeToIso(record.last_modified_time) ?? now,
      },
    ];
  }

  private async ensureFields(): Promise<Map<string, FeishuField>> {
    this.fieldsPromise ??= this.fetchAndCreateFields();
    return this.fieldsPromise;
  }

  private async fetchAndCreateFields(): Promise<Map<string, FeishuField>> {
    const fields = await this.listFields();
    for (const required of REQUIRED_FIELDS) {
      if (fields.has(required.name)) {
        continue;
      }
      const created = await this.createField(required);
      fields.set(created.field_name, created);
    }
    return fields;
  }

  private async listFields(): Promise<Map<string, FeishuField>> {
    const data = await this.request<FeishuListData<FeishuField>>(`${this.fieldsUrl()}?page_size=100`);
    return new Map((data.items ?? []).map((field) => [field.field_name, field]));
  }

  private async createField(field: RequiredField): Promise<FeishuField> {
    const data = await this.request<FeishuFieldData>(this.fieldsUrl(), {
      method: "POST",
      body: JSON.stringify({
        field_name: field.name,
        type: field.type,
      }),
    });
    return data.field ?? { field_id: field.name, field_name: field.name, type: field.type };
  }

  private recordsUrl(): string {
    return `${this.tableUrl()}/records`;
  }

  private fieldsUrl(): string {
    return `${this.tableUrl()}/fields`;
  }

  private tableUrl(): string {
    return `${this.baseUrl}/open-apis/bitable/v1/apps/${encodeURIComponent(
      this.appToken,
    )}/tables/${encodeURIComponent(this.tableId)}`;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
        ...init.headers,
      },
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as FeishuResponse<T>) : {};
    if (!response.ok || (typeof payload.code === "number" && payload.code !== 0)) {
      throw new Error(`飞书多维表格请求失败 (${response.status}): ${payload.msg || response.statusText}`);
    }
    return (payload.data ?? {}) as T;
  }
}

function textFromCell(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const text = value
      .map((item) => (typeof item === "object" && item ? textFromCell((item as { text?: unknown }).text) : textFromCell(item)))
      .filter(Boolean)
      .join("");
    return text || undefined;
  }
  return undefined;
}

function dateFromCell(value: unknown): string | undefined {
  const text = textFromCell(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function isoFromCell(value: unknown): string | undefined {
  const text = textFromCell(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : undefined;
}

function timeToIso(value: string | number | undefined): string | undefined {
  if (typeof value === "number") {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

function unitFromCell(value: unknown): EntryUnitId {
  const text = textFromCell(value);
  if (!text) {
    return "work";
  }
  if (unitLabelToId.has(text)) {
    return unitLabelToId.get(text) ?? "work";
  }
  return Object.prototype.hasOwnProperty.call(entryUnitProfiles, text) ? (text as EntryUnitId) : "work";
}

function kindFromCell(value: unknown): EventKind {
  const text = textFromCell(value);
  return (text && kindIdByLabel.get(text)) || "event";
}

function importanceFromCell(value: unknown): 1 | 2 | 3 | 4 | 5 {
  const number = typeof value === "number" ? value : Number(textFromCell(value));
  if (Number.isInteger(number) && number >= 1 && number <= 5) {
    return number as 1 | 2 | 3 | 4 | 5;
  }
  return 3;
}

function completedFromCell(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = textFromCell(value)?.toLowerCase();
  return text === "true" || text === "yes" || text === "1" || text === "已完成" || text === "完成";
}

function attachmentsFromCell(value: unknown): EntryAttachment[] {
  const text = textFromCell(value);
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? (parsed as EntryAttachment[]) : [];
  } catch {
    return [];
  }
}
