import type { EntryRepository } from "./EntryRepository";
import type { Entry } from "@desktopcal/shared";
import type { EntryDraft } from "./EntryRepository";
import {
  DEFAULT_TEABLE_BASE_URL,
  DEFAULT_TEABLE_TABLE_ID,
  TeableJsonEntryRepository,
  type TeableJsonEntryRepositoryOptions,
} from "./TeableJsonEntryRepository";
import { readFreshOAuthAccessToken } from "./TeableOAuth";

export const TEABLE_TOKEN_STORAGE_KEY = "desktopcal.teable.token";

export interface RuntimeRepositoryConfig {
  token?: string;
  baseUrl: string;
  tableId: string;
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function envToken(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_TEABLE_TOKEN?.trim() || undefined;
}

function envBaseUrl(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_TEABLE_BASE_URL?.trim() || undefined;
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
  } else {
    storage.removeItem(TEABLE_TOKEN_STORAGE_KEY);
  }
}

export function readRuntimeRepositoryConfig(storage = browserStorage()): RuntimeRepositoryConfig {
  return {
    token: readStoredTeableToken(storage) ?? readFreshOAuthAccessToken(storage) ?? envToken(),
    baseUrl: envBaseUrl() ?? DEFAULT_TEABLE_BASE_URL,
    tableId: DEFAULT_TEABLE_TABLE_ID,
  };
}

class MissingTeableTokenEntryRepository implements EntryRepository {
  async list(): Promise<Entry[]> {
    return [];
  }

  async create(_: EntryDraft): Promise<Entry> {
    throw new Error("请先保存 c8table API token");
  }

  async update(_: Entry): Promise<Entry> {
    throw new Error("请先保存 c8table API token");
  }

  async delete(_: string): Promise<void> {
    throw new Error("请先保存 c8table API token");
  }
}

export interface DefaultEntryRepositoryOptions {
  readLocalAttachmentBlob?: TeableJsonEntryRepositoryOptions["readLocalAttachmentBlob"];
}

export function createDefaultEntryRepository(
  config = readRuntimeRepositoryConfig(),
  options: DefaultEntryRepositoryOptions = {},
): EntryRepository {
  if (config.token) {
    return new TeableJsonEntryRepository({
      baseUrl: config.baseUrl,
      tableId: config.tableId,
      token: config.token,
      readLocalAttachmentBlob: options.readLocalAttachmentBlob,
    });
  }
  return new MissingTeableTokenEntryRepository();
}
