import type {
  Entry,
  EntryAttachment,
  EntryCategory,
  EventKind,
  EventShape,
  EntryUnitId,
  Importance,
} from "@desktopcal/shared";
import { getEntryUnitProfile } from "@desktopcal/shared";

export interface EntryDraft {
  localId?: string;
  unit?: EntryUnitId;
  title: string;
  date: string;
  time?: string;
  category?: EntryCategory;
  shape?: EventShape;
  kind?: EventKind;
  importance: Importance;
  completed?: boolean;
  note?: string;
  attachments?: EntryAttachment[];
}

export interface EntryRepository {
  list(): Promise<Entry[]>;
  create(draft: EntryDraft): Promise<Entry>;
  update(entry: Entry): Promise<Entry>;
  delete(id: string): Promise<void>;
}

export interface AttachmentRepository {
  add(file: File): Promise<EntryAttachment>;
  get(localBlobKey: string): Promise<Blob | undefined>;
  remove(localBlobKey: string): Promise<void>;
}

export function createLocalId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function createEntryFromDraft(
  draft: EntryDraft,
  id = `local-${createLocalId()}`,
  timestamp = new Date().toISOString(),
): Entry {
  const localId = draft.localId ?? createLocalId();
  const unit = draft.unit ?? "work";
  const presentation = getEntryUnitProfile(unit);
  const category = draft.category ?? "calendar";
  const kind = category === "todo" ? "event" : draft.kind ?? "event";
  const timestampDate = new Date(timestamp);
  return {
    id,
    localId,
    unit,
    title: draft.title.trim(),
    date: category === "todo" ? localDateKey(timestampDate) : draft.date,
    time: category === "todo" ? undefined : normalizeOptionalText(draft.time),
    category,
    shape: presentation.shape,
    kind,
    importance: draft.importance,
    completed: draft.completed ?? false,
    note: normalizeOptionalText(draft.note),
    attachments: draft.attachments ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function touchEntry(entry: Entry, timestamp = new Date().toISOString()): Entry {
  const presentation = getEntryUnitProfile(entry.unit);
  const category = entry.category ?? "calendar";
  const createdDate = new Date(entry.createdAt);
  return {
    ...entry,
    date: category === "todo" && !Number.isNaN(createdDate.getTime()) ? localDateKey(createdDate) : entry.date,
    time: category === "todo" ? undefined : normalizeOptionalText(entry.time),
    note: normalizeOptionalText(entry.note),
    title: entry.title.trim(),
    category,
    shape: presentation.shape,
    kind: category === "todo" ? "event" : entry.kind,
    completed: entry.completed ?? false,
    updatedAt: timestamp,
  };
}

export function compareEntries(a: Entry, b: Entry): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.time ?? "99:99").localeCompare(b.time ?? "99:99") ||
    b.importance - a.importance ||
    a.title.localeCompare(b.title)
  );
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort(compareEntries);
}
