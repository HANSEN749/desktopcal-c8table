import type {
  Entry,
  EntryAttachment,
  EntryAttachmentStorage,
  EntryUnitId,
  EventKind,
  EventShape,
  Importance,
} from "@desktopcal/shared";
import { getEntryUnitProfile } from "@desktopcal/shared";
import { createLocalId } from "./EntryRepository";

export const ENTRY_ENVELOPE_SCHEMA = "desktopcal.entry.v1";
export const TEABLE_JSON_FIELD_NAME = "单行文本";
export const TEABLE_JSON_FIELD_FALLBACK_NAMES = [
  TEABLE_JSON_FIELD_NAME,
  "Single line text",
  "single line text",
];

export interface EntryEnvelope {
  schema: typeof ENTRY_ENVELOPE_SCHEMA;
  localId: string;
  unit: EntryUnitId;
  title: string;
  date: string;
  time?: string;
  shape: EventShape;
  kind: EventKind;
  importance: Importance;
  note?: string;
  attachments: EntryAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface TeableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
  lastModifiedTime?: string;
}

const shapes: EventShape[] = ["circle", "triangle", "square", "diamond", "star", "hexagon"];
const kinds: EventKind[] = ["duration", "event"];
const storages: EntryAttachmentStorage[] = ["local", "teable"];
const units: EntryUnitId[] = ["work", "research", "review", "personal", "other"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isShape(value: unknown): value is EventShape {
  return typeof value === "string" && shapes.includes(value as EventShape);
}

function isKind(value: unknown): value is EventKind {
  return typeof value === "string" && kinds.includes(value as EventKind);
}

function coerceKind(value: unknown): EventKind | undefined {
  if (isKind(value)) {
    return value;
  }
  return value === "deadline" ? "duration" : undefined;
}

function isImportance(value: unknown): value is Importance {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

function isStorage(value: unknown): value is EntryAttachmentStorage {
  return typeof value === "string" && storages.includes(value as EntryAttachmentStorage);
}

function isUnit(value: unknown): value is EntryUnitId {
  return typeof value === "string" && units.includes(value as EntryUnitId);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dateText(value: unknown, fallbackDate: string): string {
  const candidate = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallbackDate;
}

function isoText(value: unknown, fallback = new Date().toISOString()): string {
  const candidate = text(value);
  return Number.isNaN(Date.parse(candidate)) ? fallback : candidate;
}

function attachmentFromUnknown(value: unknown): EntryAttachment | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = text(value.id, createLocalId());
  const storage = isStorage(value.storage)
    ? value.storage
    : optionalText(value.teableAttachmentId)
      ? "teable"
      : "local";
  const localBlobKey = optionalText(value.localBlobKey);
  const teableAttachmentId = optionalText(value.teableAttachmentId);
  return {
    id,
    storage,
    localBlobKey,
    teableAttachmentId,
    name: text(value.name, "attachment"),
    mime: text(value.mime, "application/octet-stream"),
    size: typeof value.size === "number" && value.size >= 0 ? value.size : 0,
    createdAt: isoText(value.createdAt),
    isCover: typeof value.isCover === "boolean" ? value.isCover : undefined,
    kind: value.kind === "image" || value.kind === "file" ? value.kind : undefined,
    url: optionalText(value.url),
    thumbUrl: optionalText(value.thumbUrl),
    localThumbPath: optionalText(value.localThumbPath),
    width: typeof value.width === "number" ? value.width : undefined,
    height: typeof value.height === "number" ? value.height : undefined,
  };
}

function attachmentsFromUnknown(value: unknown): EntryAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const attachment = attachmentFromUnknown(item);
    return attachment ? [attachment] : [];
  });
}

function fallbackDateFromRecord(record: TeableRecord, fallbackDate: string): string {
  const source = record.createdTime ?? record.lastModifiedTime;
  if (!source || Number.isNaN(Date.parse(source))) {
    return fallbackDate;
  }
  return new Date(source).toISOString().slice(0, 10);
}

export function entryToEnvelope(entry: Entry): EntryEnvelope {
  return {
    schema: ENTRY_ENVELOPE_SCHEMA,
    localId: entry.localId,
    unit: entry.unit,
    title: entry.title,
    date: entry.date,
    time: entry.time,
    shape: entry.shape,
    kind: entry.kind,
    importance: entry.importance,
    note: entry.note,
    attachments: entry.attachments,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function envelopeToEntry(recordId: string, value: unknown, fallbackDate: string): Entry | null {
  if (!isRecord(value) || value.schema !== ENTRY_ENVELOPE_SCHEMA) {
    return null;
  }
  const now = new Date().toISOString();
  const unit = isUnit(value.unit) ? value.unit : "work";
  const presentation = getEntryUnitProfile(unit);
  return {
    id: recordId,
    localId: text(value.localId, createLocalId()),
    unit,
    title: text(value.title, "未命名事件"),
    date: dateText(value.date, fallbackDate),
    time: optionalText(value.time),
    shape: presentation.shape,
    kind: coerceKind(value.kind) ?? "event",
    importance: isImportance(value.importance) ? value.importance : 3,
    note: optionalText(value.note),
    attachments: attachmentsFromUnknown(value.attachments),
    createdAt: isoText(value.createdAt, now),
    updatedAt: isoText(value.updatedAt, now),
  };
}

export function readTeableTextField(fields: Record<string, unknown>): unknown {
  for (const fieldName of TEABLE_JSON_FIELD_FALLBACK_NAMES) {
    if (fieldName in fields) {
      return fields[fieldName];
    }
  }
  return Object.values(fields).find((value) => typeof value === "string");
}

export function parseTeableRecord(record: TeableRecord, fallbackDate: string): Entry | null {
  const raw = readTeableTextField(record.fields);
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  const recordDate = fallbackDateFromRecord(record, fallbackDate);
  try {
    const parsed = JSON.parse(raw) as unknown;
    const entry = envelopeToEntry(record.id, parsed, recordDate);
    if (entry) {
      return entry;
    }
  } catch {
    // Fall through to legacy handling below.
  }

  const now = record.lastModifiedTime ?? record.createdTime ?? new Date().toISOString();
  return {
    id: record.id,
    localId: record.id,
    unit: "other",
    title: raw.trim(),
    date: recordDate,
    shape: getEntryUnitProfile("other").shape,
    kind: "event",
    importance: 1,
    attachments: [],
    createdAt: now,
    updatedAt: now,
    isLegacy: true,
  };
}

export function parseTeableRecords(records: TeableRecord[], fallbackDate: string): Entry[] {
  return records.flatMap((record) => {
    const entry = parseTeableRecord(record, fallbackDate);
    return entry ? [entry] : [];
  });
}
