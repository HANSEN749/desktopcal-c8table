import { describe, expect, it, vi } from "vitest";
import {
  TEABLE_OAUTH_CLIENT_ID_STORAGE_KEY,
  TEABLE_OAUTH_SESSION_STORAGE_KEY,
  ensureFreshTeableOAuthToken,
  readFreshOAuthAccessToken,
  readTeableOAuthConfig,
} from "./TeableOAuth";

describe("Teable OAuth token storage", () => {
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
});
