import Dexie, { type Table } from "dexie";
import type { Entry } from "@desktopcal/shared";
import {
  type EntryDraft,
  type EntryRepository,
  createEntryFromDraft,
  sortEntries,
  touchEntry,
} from "./EntryRepository";

export const DEFAULT_LOCAL_ENTRY_DB_NAME = "desktopcal-local-events";

class EntryDatabase extends Dexie {
  entries!: Table<Entry, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      entries: "id, date, updatedAt",
    });
    this.entries = this.table("entries");
  }
}

export class LocalEntryRepository implements EntryRepository {
  private readonly db: EntryDatabase;

  constructor(dbName = DEFAULT_LOCAL_ENTRY_DB_NAME) {
    this.db = new EntryDatabase(dbName);
  }

  async list(): Promise<Entry[]> {
    return sortEntries(await this.db.entries.toArray());
  }

  async create(draft: EntryDraft): Promise<Entry> {
    const entry = createEntryFromDraft(draft);
    await this.db.entries.put(entry);
    return entry;
  }

  async update(entry: Entry): Promise<Entry> {
    const updated = touchEntry(entry);
    await this.db.entries.put(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db.entries.delete(id);
  }

  async put(entry: Entry): Promise<void> {
    await this.db.entries.put(entry);
  }

  async replace(previousId: string, entry: Entry): Promise<void> {
    if (previousId !== entry.id) {
      await this.db.entries.delete(previousId);
    }
    await this.db.entries.put(entry);
  }

  close(): void {
    this.db.close();
  }
}
