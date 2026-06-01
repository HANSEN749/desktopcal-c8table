import type { EntryRepository } from "./EntryRepository";
import {
  DEFAULT_FEISHU_BASE_URL,
  FeishuBitableEntryRepository,
  type FeishuBitableEntryRepositoryOptions,
} from "./FeishuBitableEntryRepository";
import { LocalEntryRepository } from "./LocalEntryRepository";
import { LocalFirstEntryRepository } from "./LocalFirstEntryRepository";
import {
  DEFAULT_TEABLE_BASE_URL,
  DEFAULT_TEABLE_TABLE_ID,
  TeableJsonEntryRepository,
  type TeableJsonEntryRepositoryOptions,
} from "./TeableJsonEntryRepository";
import { readFreshOAuthAccessToken } from "./TeableOAuth";

export type RepositoryProvider = "local" | "teable" | "feishu";

export const REPOSITORY_PROVIDER_STORAGE_KEY = "desktopcal.repository.provider";
export const TEABLE_TOKEN_STORAGE_KEY = "desktopcal.teable.token";
export const FEISHU_ACCESS_TOKEN_STORAGE_KEY = "desktopcal.feishu.accessToken";
export const FEISHU_APP_TOKEN_STORAGE_KEY = "desktopcal.feishu.appToken";
export const FEISHU_TABLE_ID_STORAGE_KEY = "desktopcal.feishu.tableId";
export const FEISHU_BASE_URL_STORAGE_KEY = "desktopcal.feishu.baseUrl";
export const DATABASE_URL_STORAGE_KEY = "desktopcal.database.url";

export interface FeishuRuntimeConfig {
  accessToken?: string;
  appToken?: string;
  tableId?: string;
  baseUrl: string;
}

export interface RuntimeRepositoryConfig {
  provider: RepositoryProvider;
  teableToken?: string;
  teableBaseUrl: string;
  teableTableId: string;
  databaseUrl?: string;
  feishu: FeishuRuntimeConfig;
}

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

function normalizeProvider(value: string | undefined): RepositoryProvider | undefined {
  return value === "local" || value === "teable" || value === "feishu" ? value : undefined;
}

export function readStoredRepositoryProvider(storage = browserStorage()): RepositoryProvider | undefined {
  return normalizeProvider(storage?.getItem(REPOSITORY_PROVIDER_STORAGE_KEY)?.trim());
}

export function saveStoredRepositoryProvider(provider: RepositoryProvider, storage = browserStorage()): void {
  storage?.setItem(REPOSITORY_PROVIDER_STORAGE_KEY, provider);
}

export function readStoredTeableToken(storage = browserStorage()): string | undefined {
  return storage?.getItem(TEABLE_TOKEN_STORAGE_KEY)?.trim() || undefined;
}

export function saveStoredTeableToken(token: string, storage = browserStorage()): void {
  if (!storage) {
    return;
  }
  const trimmed = token.trim();
  if (trimmed) {
    storage.setItem(TEABLE_TOKEN_STORAGE_KEY, trimmed);
    saveStoredRepositoryProvider("teable", storage);
  } else {
    storage.removeItem(TEABLE_TOKEN_STORAGE_KEY);
  }
}

export function readStoredFeishuConfig(storage = browserStorage()): FeishuRuntimeConfig {
  return {
    accessToken:
      storage?.getItem(FEISHU_ACCESS_TOKEN_STORAGE_KEY)?.trim() ||
      envValue("VITE_FEISHU_ACCESS_TOKEN"),
    appToken:
      storage?.getItem(FEISHU_APP_TOKEN_STORAGE_KEY)?.trim() ||
      envValue("VITE_FEISHU_APP_TOKEN"),
    tableId:
      storage?.getItem(FEISHU_TABLE_ID_STORAGE_KEY)?.trim() ||
      envValue("VITE_FEISHU_TABLE_ID"),
    baseUrl:
      storage?.getItem(FEISHU_BASE_URL_STORAGE_KEY)?.trim() ||
      envValue("VITE_FEISHU_BASE_URL") ||
      DEFAULT_FEISHU_BASE_URL,
  };
}

export function saveStoredFeishuConfig(config: Partial<FeishuRuntimeConfig>, storage = browserStorage()): void {
  if (!storage) {
    return;
  }
  saveOptionalStorageValue(storage, FEISHU_ACCESS_TOKEN_STORAGE_KEY, config.accessToken);
  saveOptionalStorageValue(storage, FEISHU_APP_TOKEN_STORAGE_KEY, config.appToken);
  saveOptionalStorageValue(storage, FEISHU_TABLE_ID_STORAGE_KEY, config.tableId);
  saveOptionalStorageValue(storage, FEISHU_BASE_URL_STORAGE_KEY, config.baseUrl);
  if (config.accessToken?.trim() && config.appToken?.trim() && config.tableId?.trim()) {
    saveStoredRepositoryProvider("feishu", storage);
  }
}

export function readStoredDatabaseUrl(storage = browserStorage()): string | undefined {
  return storage?.getItem(DATABASE_URL_STORAGE_KEY)?.trim() || envValue("VITE_DATABASE_URL");
}

export function saveStoredDatabaseUrl(url: string, storage = browserStorage()): void {
  if (!storage) {
    return;
  }
  saveOptionalStorageValue(storage, DATABASE_URL_STORAGE_KEY, url);
}

function saveOptionalStorageValue(storage: Storage, key: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) {
    storage.setItem(key, trimmed);
  } else if (value !== undefined) {
    storage.removeItem(key);
  }
}

export function readRuntimeRepositoryConfig(storage = browserStorage()): RuntimeRepositoryConfig {
  const teableToken = readStoredTeableToken(storage) ?? readFreshOAuthAccessToken(storage) ?? envValue("VITE_TEABLE_TOKEN");
  const feishu = readStoredFeishuConfig(storage);
  const storedProvider = readStoredRepositoryProvider(storage);
  const provider =
    storedProvider ??
    (teableToken ? "teable" : feishu.accessToken && feishu.appToken && feishu.tableId ? "feishu" : "local");
  return {
    provider,
    teableToken,
    teableBaseUrl: envValue("VITE_TEABLE_BASE_URL") ?? DEFAULT_TEABLE_BASE_URL,
    teableTableId: envValue("VITE_TEABLE_TABLE_ID") ?? DEFAULT_TEABLE_TABLE_ID,
    databaseUrl: readStoredDatabaseUrl(storage),
    feishu,
  };
}

export interface DefaultEntryRepositoryOptions {
  readLocalAttachmentBlob?: TeableJsonEntryRepositoryOptions["readLocalAttachmentBlob"];
  localRepository?: LocalEntryRepository;
  teableFetcher?: TeableJsonEntryRepositoryOptions["fetcher"];
  feishuFetcher?: FeishuBitableEntryRepositoryOptions["fetcher"];
}

export function createDefaultEntryRepository(
  config = readRuntimeRepositoryConfig(),
  options: DefaultEntryRepositoryOptions = {},
): EntryRepository {
  const local = options.localRepository ?? new LocalEntryRepository();
  const remote = createRemoteRepository(config, options);
  return new LocalFirstEntryRepository(local, remote);
}

function createRemoteRepository(
  config: RuntimeRepositoryConfig,
  options: DefaultEntryRepositoryOptions,
): EntryRepository | undefined {
  if (config.provider === "teable" && config.teableToken) {
    return new TeableJsonEntryRepository({
      baseUrl: config.teableBaseUrl,
      tableId: config.teableTableId,
      token: config.teableToken,
      fetcher: options.teableFetcher,
      readLocalAttachmentBlob: options.readLocalAttachmentBlob,
    });
  }
  if (
    config.provider === "feishu" &&
    config.feishu.accessToken &&
    config.feishu.appToken &&
    config.feishu.tableId
  ) {
    return new FeishuBitableEntryRepository({
      baseUrl: config.feishu.baseUrl,
      accessToken: config.feishu.accessToken,
      appToken: config.feishu.appToken,
      tableId: config.feishu.tableId,
      fetcher: options.feishuFetcher,
    });
  }
  return undefined;
}
