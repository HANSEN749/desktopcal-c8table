import Dexie, { type Table } from "dexie";
import type { EntryAttachment } from "@desktopcal/shared";
import { type AttachmentRepository, createLocalId } from "./EntryRepository";

export const DEFAULT_ATTACHMENT_DB_NAME = "desktopcal-local-attachments";

interface AttachmentBlobRecord {
  localBlobKey: string;
  blob: Blob;
  bytes: ArrayBuffer;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}

class AttachmentDatabase extends Dexie {
  attachments!: Table<AttachmentBlobRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      attachments: "localBlobKey, createdAt",
    });
    this.attachments = this.table("attachments");
  }
}

export class LocalAttachmentRepository implements AttachmentRepository {
  private readonly db: AttachmentDatabase;

  constructor(dbName = DEFAULT_ATTACHMENT_DB_NAME) {
    this.db = new AttachmentDatabase(dbName);
  }

  async add(file: File): Promise<EntryAttachment> {
    const id = createLocalId();
    const createdAt = new Date().toISOString();
    const localBlobKey = `attachment:${id}`;
    const mime = file.type || "application/octet-stream";
    const bytes = await file.arrayBuffer();
    const blob = new Blob([bytes], { type: mime });
    await this.db.attachments.put({
      localBlobKey,
      blob,
      bytes,
      name: file.name,
      mime,
      size: file.size,
      createdAt,
    });
    return {
      id,
      storage: "local",
      localBlobKey,
      name: file.name,
      mime,
      size: file.size,
      createdAt,
      kind: file.type.startsWith("image/") ? "image" : "file",
    };
  }

  async get(localBlobKey: string): Promise<Blob | undefined> {
    const record = await this.db.attachments.get(localBlobKey);
    if (!record) {
      return undefined;
    }
    if (record.blob instanceof Blob && typeof record.blob.size === "number") {
      return record.blob;
    }
    return new Blob([record.bytes], { type: record.mime });
  }

  async remove(localBlobKey: string): Promise<void> {
    await this.db.attachments.delete(localBlobKey);
  }

  close(): void {
    this.db.close();
  }
}
