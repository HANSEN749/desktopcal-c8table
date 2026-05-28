import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { LocalAttachmentRepository } from "./LocalAttachmentRepository";

const dbNames: string[] = [];

describe("LocalAttachmentRepository", () => {
  afterEach(async () => {
    await Promise.all(dbNames.splice(0).map((name) => Dexie.delete(name)));
  });

  it("adds, reads, and removes attachment blobs from IndexedDB", async () => {
    const dbName = `desktopcal-attachment-test-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repo = new LocalAttachmentRepository(dbName);
    const file = new File(["image-bytes"], "photo.jpg", { type: "image/jpeg" });

    const attachment = await repo.add(file);
    const blob = await repo.get(attachment.localBlobKey ?? "");

    expect(attachment).toMatchObject({
      storage: "local",
      name: "photo.jpg",
      mime: "image/jpeg",
      size: file.size,
    });
    expect(blob?.size).toBe(file.size);

    const restartedRepo = new LocalAttachmentRepository(dbName);
    expect((await restartedRepo.get(attachment.localBlobKey ?? ""))?.size).toBe(file.size);

    await repo.remove(attachment.localBlobKey ?? "");
    expect(await restartedRepo.get(attachment.localBlobKey ?? "")).toBeUndefined();
    repo.close();
    restartedRepo.close();
  });
});
