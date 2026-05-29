import { describe, expect, it } from "vitest";
import { LocalEntryRepository } from "./LocalEntryRepository";
import { createDefaultEntryRepository, readRuntimeRepositoryConfig, saveStoredFeishuConfig, saveStoredRepositoryProvider, saveStoredTeableToken } from "./runtimeConfig";

describe("runtime repository config", () => {
  it("defaults to local backup storage when no remote backend is configured", async () => {
    const storage = window.localStorage;
    storage.clear();
    const config = readRuntimeRepositoryConfig(storage);
    const repo = createDefaultEntryRepository(config, {
      localRepository: new LocalEntryRepository(`desktopcal-runtime-local-${crypto.randomUUID()}`),
    });

    const created = await repo.create({
      title: "本地可用",
      date: "2026-05-30",
      kind: "event",
      importance: 3,
      attachments: [],
    });

    expect(config.provider).toBe("local");
    expect(created.id).toMatch(/^local-/);
  });

  it("stores selected c8table and Feishu providers separately", () => {
    const storage = window.localStorage;
    storage.clear();

    saveStoredTeableToken("teable-token", storage);
    expect(readRuntimeRepositoryConfig(storage)).toMatchObject({
      provider: "teable",
      teableToken: "teable-token",
    });

    saveStoredFeishuConfig(
      {
        accessToken: "feishu-access",
        appToken: "app-token",
        tableId: "tbl-token",
      },
      storage,
    );
    expect(readRuntimeRepositoryConfig(storage)).toMatchObject({
      provider: "feishu",
      feishu: {
        accessToken: "feishu-access",
        appToken: "app-token",
        tableId: "tbl-token",
      },
    });

    saveStoredRepositoryProvider("local", storage);
    expect(readRuntimeRepositoryConfig(storage).provider).toBe("local");
  });
});
