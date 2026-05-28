import type {
  Entry,
  EntryAttachment,
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
  shape?: EventShape;
  kind?: EventKind;
  importance: Importance;
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

export function createEntryFromDraft(
  draft: EntryDraft,
  id = `local-${createLocalId()}`,
  timestamp = new Date().toISOString(),
): Entry {
  const localId = draft.localId ?? createLocalId();
  const unit = draft.unit ?? "work";
  const presentation = getEntryUnitProfile(unit);
  const kind = draft.kind ?? "event";
  return {
    id,
    localId,
    unit,
    title: draft.title.trim(),
    date: draft.date,
    time: normalizeOptionalText(draft.time),
    shape: presentation.shape,
    kind,
    importance: draft.importance,
    note: normalizeOptionalText(draft.note),
    attachments: draft.attachments ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function touchEntry(entry: Entry, timestamp = new Date().toISOString()): Entry {
  const presentation = getEntryUnitProfile(entry.unit);
  return {
    ...entry,
    time: normalizeOptionalText(entry.time),
    note: normalizeOptionalText(entry.note),
    title: entry.title.trim(),
    shape: presentation.shape,
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
