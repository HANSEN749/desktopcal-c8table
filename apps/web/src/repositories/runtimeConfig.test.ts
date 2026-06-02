import { describe, expect, it } from "vitest";
import { LocalEntryRepository } from "./LocalEntryRepository";
import { TEABLE_OAUTH_ACCOUNTS_STORAGE_KEY, TEABLE_OAUTH_ACTIVE_ACCOUNT_STORAGE_KEY } from "./TeableOAuth";
import {
  createDefaultEntryRepository,
  readRuntimeRepositoryConfig,
  saveStoredDatabaseUrl,
  saveStoredFeishuConfig,
  saveStoredRepositoryProvider,
  saveStoredTeableToken,
} from "./runtimeConfig";

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

  it("stores a visual database URL separately from API credentials", () => {
    const storage = window.localStorage;
    storage.clear();

    saveStoredDatabaseUrl(" https://c8table.com/base/app/table/tbl/view/viw ", storage);
    expect(readRuntimeRepositoryConfig(storage).databaseUrl).toBe("https://c8table.com/base/app/table/tbl/view/viw");

    saveStoredDatabaseUrl("", storage);
    expect(readRuntimeRepositoryConfig(storage).databaseUrl).toBeUndefined();
  });

  it("derives local fallback storage scope from the active OAuth account", () => {
    const storage = window.localStorage;
    storage.clear();
    const expiresAt = Date.now() + 120_000;
    storage.setItem(
      TEABLE_OAUTH_ACCOUNTS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "usr-tenant-a",
          user: { id: "usr-tenant-a", name: "Tenant A" },
          session: {
            accessToken: "oauth-access",
            refreshToken: "oauth-refresh",
            expiresAt,
            refreshExpiresAt: expiresAt + 30 * 86_400_000,
            scopes: ["record|read"],
          },
          baseUrl: "https://c8table.com",
          clientId: "client-1",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ]),
    );
    storage.setItem(TEABLE_OAUTH_ACTIVE_ACCOUNT_STORAGE_KEY, "usr-tenant-a");

    expect(readRuntimeRepositoryConfig(storage)).toMatchObject({
      provider: "teable",
      teableToken: "oauth-access",
      localStorageScope: "teable-usr-tenant-a",
    });
  });
});
