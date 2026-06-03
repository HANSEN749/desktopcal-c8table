import { describe, expect, it, vi } from "vitest";
import {
  TEABLE_OAUTH_CLIENT_ID_STORAGE_KEY,
  TEABLE_OAUTH_ACCOUNTS_STORAGE_KEY,
  TEABLE_OAUTH_ACTIVE_ACCOUNT_STORAGE_KEY,
  TEABLE_OAUTH_SESSION_STORAGE_KEY,
  ensureFreshTeableOAuthToken,
  fetchTeableOAuthUser,
  getTeableOAuthRedirectUri,
  oauthAccountStorageScope,
  readActiveTeableOAuthAccount,
  readFreshOAuthAccessToken,
  readTeableOAuthConfig,
  readTeableOAuthSession,
  switchTeableOAuthAccount,
} from "./TeableOAuth";

describe("Teable OAuth token storage", () => {
  it("uses the current app origin as the OAuth redirect URL for web or Tauri", () => {
    expect(
      getTeableOAuthRedirectUri({
        origin: "http://tauri.localhost",
        pathname: "/",
      } as Location),
    ).toBe("http://tauri.localhost/");
    expect(
      getTeableOAuthRedirectUri({
        origin: "http://127.0.0.1:5600",
        pathname: "/",
      } as Location),
    ).toBe("http://127.0.0.1:5600/");
  });

  it("uses a fresh OAuth access token as the repository token", () => {
    const storage = window.localStorage;
    storage.clear();
    storage.setItem(
      TEABLE_OAUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 120_000,
        refreshExpiresAt: Date.now() + 30 * 86_400_000,
        scopes: ["record|read"],
      }),
    );

    expect(readFreshOAuthAccessToken(storage)).toBe("access");
  });

  it("refreshes expired OAuth access tokens and stores rotated refresh tokens", async () => {
    const storage = window.localStorage;
    storage.clear();
    storage.setItem(TEABLE_OAUTH_CLIENT_ID_STORAGE_KEY, "client-1");
    storage.setItem(
      TEABLE_OAUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: Date.now() - 1_000,
        refreshExpiresAt: Date.now() + 30 * 86_400_000,
        scopes: [],
      }),
    );
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 600,
          refresh_expires_in: 2_592_000,
          scopes: ["record|read"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as typeof fetch;

    await expect(ensureFreshTeableOAuthToken(readTeableOAuthConfig(storage), storage, fetcher)).resolves.toBe(
      "new-access",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://c8table.com/api/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams),
      }),
    );
    const saved = JSON.parse(storage.getItem(TEABLE_OAUTH_SESSION_STORAGE_KEY) ?? "{}") as {
      refreshToken?: string;
    };
    expect(saved.refreshToken).toBe("new-refresh");
  });

  it("reads Teable user profile from the OAuth access token", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ id: "usr-1", name: "Alice", email: "alice@example.com", avatar: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;

    await expect(fetchTeableOAuthUser("https://c8table.com", "access-token", fetcher)).resolves.toEqual({
      id: "usr-1",
      name: "Alice",
      email: "alice@example.com",
      avatar: undefined,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://c8table.com/api/auth/user",
      expect.objectContaining({
        headers: { Authorization: "Bearer access-token" },
      }),
    );
  });

  it("switches between saved OAuth accounts and scopes local storage by user", () => {
    const storage = window.localStorage;
    storage.clear();
    const expiresAt = Date.now() + 120_000;
    storage.setItem(
      TEABLE_OAUTH_ACCOUNTS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "usr-a",
          user: { id: "usr-a", name: "Alice", email: "alice@example.com" },
          session: {
            accessToken: "access-a",
            refreshToken: "refresh-a",
            expiresAt,
            refreshExpiresAt: expiresAt + 30 * 86_400_000,
            scopes: ["record|read"],
          },
          baseUrl: "https://c8table.com",
          clientId: "client-1",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "usr-b",
          user: { id: "usr-b", name: "Bob", email: "bob@example.com" },
          session: {
            accessToken: "access-b",
            refreshToken: "refresh-b",
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
    storage.setItem(TEABLE_OAUTH_ACTIVE_ACCOUNT_STORAGE_KEY, "usr-b");

    expect(readActiveTeableOAuthAccount(storage)?.user.email).toBe("bob@example.com");
    expect(readTeableOAuthSession(storage)?.accessToken).toBe("access-b");
    expect(oauthAccountStorageScope(readActiveTeableOAuthAccount(storage))).toBe("teable-usr-b");

    switchTeableOAuthAccount("usr-a", storage);

    expect(readFreshOAuthAccessToken(storage)).toBe("access-a");
    expect(JSON.parse(storage.getItem(TEABLE_OAUTH_SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
      accessToken: "access-a",
    });
  });
});
