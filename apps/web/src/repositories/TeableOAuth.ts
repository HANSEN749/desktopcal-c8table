import { DEFAULT_TEABLE_BASE_URL } from "./TeableJsonEntryRepository";

export const TEABLE_OAUTH_CLIENT_ID_STORAGE_KEY = "desktopcal.teable.oauth.clientId";
export const TEABLE_OAUTH_SESSION_STORAGE_KEY = "desktopcal.teable.oauth.session";
const TEABLE_OAUTH_STATE_STORAGE_KEY = "desktopcal.teable.oauth.state";
const TEABLE_OAUTH_VERIFIER_STORAGE_KEY = "desktopcal.teable.oauth.verifier";
const TEABLE_OAUTH_REDIRECT_STORAGE_KEY = "desktopcal.teable.oauth.redirectUri";

const defaultScopes = [
  "table|read",
  "field|read",
  "field|create",
  "record|read",
  "record|create",
  "record|update",
  "record|delete",
];

export interface TeableOAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
  scopes: string[];
}

export interface TeableOAuthConfig {
  clientId?: string;
  baseUrl: string;
  scopes: string[];
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  scopes?: string[];
}

type Fetcher = typeof fetch;

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function envValue(key: string): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.[key]?.trim() || undefined;
}

export function readStoredOAuthClientId(storage = browserStorage()): string | undefined {
  return storage?.getItem(TEABLE_OAUTH_CLIENT_ID_STORAGE_KEY)?.trim() || undefined;
}

export function saveStoredOAuthClientId(clientId: string, storage = browserStorage()): void {
  const trimmed = clientId.trim();
  if (!storage) {
    return;
  }
  if (trimmed) {
    storage.setItem(TEABLE_OAUTH_CLIENT_ID_STORAGE_KEY, trimmed);
  } else {
    storage.removeItem(TEABLE_OAUTH_CLIENT_ID_STORAGE_KEY);
  }
}

export function readTeableOAuthConfig(storage = browserStorage()): TeableOAuthConfig {
  return {
    clientId: readStoredOAuthClientId(storage) ?? envValue("VITE_TEABLE_OAUTH_CLIENT_ID"),
    baseUrl: envValue("VITE_TEABLE_BASE_URL") ?? DEFAULT_TEABLE_BASE_URL,
    scopes: defaultScopes,
  };
}

export function readTeableOAuthSession(storage = browserStorage()): TeableOAuthSession | undefined {
  const raw = storage?.getItem(TEABLE_OAUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<TeableOAuthSession>;
    if (
      typeof parsed.accessToken === "string" &&
      typeof parsed.refreshToken === "string" &&
      typeof parsed.expiresAt === "number" &&
      typeof parsed.refreshExpiresAt === "number"
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt,
        refreshExpiresAt: parsed.refreshExpiresAt,
        scopes: Array.isArray(parsed.scopes) ? parsed.scopes.filter((scope) => typeof scope === "string") : [],
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function clearTeableOAuthSession(storage = browserStorage()): void {
  storage?.removeItem(TEABLE_OAUTH_SESSION_STORAGE_KEY);
}

export function readFreshOAuthAccessToken(storage = browserStorage(), now = Date.now()): string | undefined {
  const session = readTeableOAuthSession(storage);
  return session && session.expiresAt > now + 60_000 ? session.accessToken : undefined;
}

export async function beginTeableOAuthLogin(
  config: TeableOAuthConfig,
  storage = browserStorage(),
  location: Location = window.location,
): Promise<void> {
  if (!storage || !config.clientId) {
    throw new Error("请先配置 c8table OAuth Client ID");
  }
  const state = randomBase64Url(24);
  const verifier = randomBase64Url(48);
  const challenge = await codeChallenge(verifier);
  const redirectUri = `${location.origin}${location.pathname}`;
  storage.setItem(TEABLE_OAUTH_STATE_STORAGE_KEY, state);
  storage.setItem(TEABLE_OAUTH_VERIFIER_STORAGE_KEY, verifier);
  storage.setItem(TEABLE_OAUTH_REDIRECT_STORAGE_KEY, redirectUri);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: config.scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  location.assign(`${config.baseUrl.replace(/\/$/, "")}/api/oauth/authorize?${params}`);
}

export async function completeTeableOAuthCallback(
  config: TeableOAuthConfig,
  storage = browserStorage(),
  fetcher: Fetcher = globalThis.fetch.bind(globalThis),
  location: Location = window.location,
): Promise<"none" | "connected"> {
  if (!storage || !config.clientId) {
    return "none";
  }
  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  if (error) {
    cleanupOAuthCallbackUrl(location);
    throw new Error(`c8table OAuth 授权失败：${error}`);
  }
  const code = params.get("code");
  const returnedState = params.get("state");
  if (!code) {
    return "none";
  }
  const expectedState = storage.getItem(TEABLE_OAUTH_STATE_STORAGE_KEY);
  const verifier = storage.getItem(TEABLE_OAUTH_VERIFIER_STORAGE_KEY);
  const redirectUri = storage.getItem(TEABLE_OAUTH_REDIRECT_STORAGE_KEY);
  if (!expectedState || returnedState !== expectedState || !verifier || !redirectUri) {
    cleanupOAuthCallbackUrl(location);
    throw new Error("c8table OAuth state 校验失败");
  }
  const token = await requestOAuthToken(config.baseUrl, fetcher, {
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
  saveOAuthTokenResponse(token, storage);
  storage.removeItem(TEABLE_OAUTH_STATE_STORAGE_KEY);
  storage.removeItem(TEABLE_OAUTH_VERIFIER_STORAGE_KEY);
  storage.removeItem(TEABLE_OAUTH_REDIRECT_STORAGE_KEY);
  cleanupOAuthCallbackUrl(location);
  return "connected";
}

export async function ensureFreshTeableOAuthToken(
  config: TeableOAuthConfig,
  storage = browserStorage(),
  fetcher: Fetcher = globalThis.fetch.bind(globalThis),
): Promise<string | undefined> {
  if (!storage || !config.clientId) {
    return undefined;
  }
  const now = Date.now();
  const fresh = readFreshOAuthAccessToken(storage, now);
  if (fresh) {
    return fresh;
  }
  const session = readTeableOAuthSession(storage);
  if (!session || session.refreshExpiresAt <= now + 60_000) {
    clearTeableOAuthSession(storage);
    return undefined;
  }
  const token = await requestOAuthToken(config.baseUrl, fetcher, {
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
    client_id: config.clientId,
  });
  saveOAuthTokenResponse(token, storage);
  return token.access_token;
}

function saveOAuthTokenResponse(token: OAuthTokenResponse, storage: Storage): void {
  const now = Date.now();
  const session: TeableOAuthSession = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: now + token.expires_in * 1000,
    refreshExpiresAt: now + token.refresh_expires_in * 1000,
    scopes: token.scopes ?? [],
  };
  storage.setItem(TEABLE_OAUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function requestOAuthToken(
  baseUrl: string,
  fetcher: Fetcher,
  body: Record<string, string>,
): Promise<OAuthTokenResponse> {
  const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/api/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`c8table OAuth token 请求失败 (${response.status}): ${message || response.statusText}`);
  }
  return (await response.json()) as OAuthTokenResponse;
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function randomBase64Url(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return base64Url(values);
}

function base64Url(values: Uint8Array): string {
  let binary = "";
  for (const value of values) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function cleanupOAuthCallbackUrl(location: Location): void {
  const cleanUrl = `${location.origin}${location.pathname}${location.hash}`;
  window.history.replaceState({}, document.title, cleanUrl);
}
