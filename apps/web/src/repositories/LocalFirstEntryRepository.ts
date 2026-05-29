import type { Entry } from "@desktopcal/shared";
import {
  type EntryDraft,
  type EntryRepository,
  sortEntries,
} from "./EntryRepository";
import { LocalEntryRepository } from "./LocalEntryRepository";

export class LocalFirstEntryRepository implements EntryRepository {
  constructor(
    private readonly local: LocalEntryRepository,
    private readonly remote?: EntryRepository,
  ) {}

  async list(): Promise<Entry[]> {
    const localEntries = await this.local.list();
    if (!this.remote) {
      return localEntries;
    }

    try {
      const remoteEntries = await this.remote.list();
      const localByLocalId = new Map(localEntries.map((entry) => [entry.localId, entry]));
      const resolvedRemoteEntries: Entry[] = [];
      const remoteLocalIds = new Set(remoteEntries.map((entry) => entry.localId));
      const localOnly = localEntries.filter((entry) => !remoteLocalIds.has(entry.localId));
      const syncedLocalOnly: Entry[] = [];

      for (const remoteEntry of remoteEntries) {
        const localMatch = localByLocalId.get(remoteEntry.localId);
        if (localMatch && isNewer(localMatch, remoteEntry)) {
          try {
            const saved = await this.remote.update({ ...localMatch, id: remoteEntry.id });
            await this.local.replace(localMatch.id, saved);
            resolvedRemoteEntries.push(saved);
            continue;
          } catch {
            resolvedRemoteEntries.push(localMatch);
            continue;
          }
        }
        await this.local.put(remoteEntry);
        resolvedRemoteEntries.push(remoteEntry);
      }

      for (const entry of localOnly) {
        if (!isLocalOnlyEntry(entry)) {
          syncedLocalOnly.push(entry);
          continue;
        }
        try {
          const saved = await this.remote.create(entryToDraft(entry));
          await this.local.replace(entry.id, saved);
          syncedLocalOnly.push(saved);
        } catch {
          syncedLocalOnly.push(entry);
        }
      }

      return sortEntries([...resolvedRemoteEntries, ...syncedLocalOnly]);
    } catch {
      return localEntries;
    }
  }

  async create(draft: EntryDraft): Promise<Entry> {
    const localEntry = await this.local.create(draft);
    if (!this.remote) {
      return localEntry;
    }
    try {
      const saved = await this.remote.create({ ...draft, localId: localEntry.localId });
      await this.local.replace(localEntry.id, saved);
      return saved;
    } catch {
      return localEntry;
    }
  }

  async update(entry: Entry): Promise<Entry> {
    const localEntry = await this.local.update(entry);
    if (!this.remote) {
      return localEntry;
    }
    try {
      const saved = isLocalOnlyEntry(localEntry)
        ? await this.remote.create(entryToDraft(localEntry))
        : await this.remote.update(localEntry);
      await this.local.replace(localEntry.id, saved);
      return saved;
    } catch {
      return localEntry;
    }
  }

  async delete(id: string): Promise<void> {
    await this.local.delete(id);
    if (!this.remote || id.startsWith("local-")) {
      return;
    }
    try {
      await this.remote.delete(id);
    } catch {
      // The local backup remains authoritative when the remote table is temporarily unavailable.
    }
  }
}

function isLocalOnlyEntry(entry: Entry): boolean {
  return entry.id.startsWith("local-");
}

function isNewer(left: Entry, right: Entry): boolean {
  return Date.parse(left.updatedAt) > Date.parse(right.updatedAt);
}

function entryToDraft(entry: Entry): EntryDraft {
  return {
    localId: entry.localId,
    unit: entry.unit,
    title: entry.title,
    date: entry.date,
    time: entry.time,
    kind: entry.kind,
    importance: entry.importance,
    completed: entry.completed,
    note: entry.note,
    attachments: entry.attachments,
  };
}
