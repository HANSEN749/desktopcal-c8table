import type { Entry } from "@desktopcal/shared";
import { describe, expect, it, vi } from "vitest";
import type { EntryDraft, EntryRepository } from "./EntryRepository";
import { createEntryFromDraft, touchEntry } from "./EntryRepository";
import { LocalEntryRepository } from "./LocalEntryRepository";
import { LocalFirstEntryRepository } from "./LocalFirstEntryRepository";

class MemoryRemoteRepository implements EntryRepository {
  list = vi.fn(async () => this.entries);
  create = vi.fn(async (draft: EntryDraft) => {
    const entry = createEntryFromDraft(draft, `rec-${this.entries.length + 1}`);
    this.entries = [entry, ...this.entries];
    return entry;
  });
  update = vi.fn(async (entry: Entry) => {
    const updated = touchEntry(entry);
    this.entries = this.entries.map((item) => (item.id === updated.id ? updated : item));
    return updated;
  });
  delete = vi.fn(async (id: string) => {
    this.entries = this.entries.filter((entry) => entry.id !== id);
  });

  constructor(private entries: Entry[] = []) {}
}

describe("LocalFirstEntryRepository", () => {
  it("works locally without a remote backend", async () => {
    const local = new LocalEntryRepository(`desktopcal-test-local-${crypto.randomUUID()}`);
    const repo = new LocalFirstEntryRepository(local);

    const created = await repo.create({
      title: "本地事件",
      date: "2026-05-30",
      kind: "event",
      importance: 3,
      attachments: [],
    });
    const updated = await repo.update({ ...created, title: "本地改名" });
    const entries = await repo.list();

    expect(created.id).toMatch(/^local-/);
    expect(updated.title).toBe("本地改名");
    expect(entries[0].title).toBe("本地改名");
    local.close();
  });

  it("pushes local-only entries when a remote backend becomes available", async () => {
    const local = new LocalEntryRepository(`desktopcal-test-sync-${crypto.randomUUID()}`);
    const localOnly = await local.create({
      title: "待同步",
      date: "2026-05-30",
      kind: "duration",
      importance: 4,
      attachments: [],
    });
    const remote = new MemoryRemoteRepository();
    const repo = new LocalFirstEntryRepository(local, remote);

    const entries = await repo.list();
    const cached = await local.list();

    expect(remote.create).toHaveBeenCalledWith(expect.objectContaining({ localId: localOnly.localId }));
    expect(entries[0]).toMatchObject({ id: "rec-1", title: "待同步" });
    expect(cached[0]).toMatchObject({ id: "rec-1", title: "待同步" });
    local.close();
  });

  it("keeps local writes when remote create fails", async () => {
    const local = new LocalEntryRepository(`desktopcal-test-fallback-${crypto.randomUUID()}`);
    const remote = new MemoryRemoteRepository();
    remote.create.mockRejectedValueOnce(new Error("remote down"));
    const repo = new LocalFirstEntryRepository(local, remote);

    const created = await repo.create({
      title: "离线事件",
      date: "2026-05-30",
      kind: "event",
      importance: 3,
      attachments: [],
    });
    const entries = await repo.list();

    expect(created.id).toMatch(/^local-/);
    expect(entries.some((entry) => entry.title === "离线事件")).toBe(true);
    local.close();
  });

  it("pushes newer local edits over stale remote records", async () => {
    const local = new LocalEntryRepository(`desktopcal-test-newer-${crypto.randomUUID()}`);
    const remoteEntry = createEntryFromDraft(
      {
        localId: "shared-local-id",
        title: "远端旧标题",
        date: "2026-05-30",
        kind: "event",
        importance: 3,
        attachments: [],
      },
      "rec-1",
      "2026-05-29T08:00:00.000Z",
    );
    await local.put({
      ...remoteEntry,
      title: "本地新标题",
      updatedAt: "2026-05-29T09:00:00.000Z",
    });
    const remote = new MemoryRemoteRepository([remoteEntry]);
    const repo = new LocalFirstEntryRepository(local, remote);

    const entries = await repo.list();

    expect(remote.update).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-1", title: "本地新标题" }));
    expect(entries[0]).toMatchObject({ id: "rec-1", title: "本地新标题" });
    local.close();
  });
});
