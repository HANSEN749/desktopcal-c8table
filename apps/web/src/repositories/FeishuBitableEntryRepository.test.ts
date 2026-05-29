import { describe, expect, it, vi } from "vitest";
import { makeEntry } from "../test/factories";
import { FeishuBitableEntryRepository, type FeishuFetcher } from "./FeishuBitableEntryRepository";

function feishuResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ code: 0, msg: "success", data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function existingFields() {
  return {
    items: [
      { field_id: "fld-title", field_name: "标题", type: 1 },
      { field_id: "fld-date", field_name: "日期", type: 1 },
      { field_id: "fld-time", field_name: "时间", type: 1 },
      { field_id: "fld-unit", field_name: "单位", type: 1 },
      { field_id: "fld-kind", field_name: "类型", type: 1 },
      { field_id: "fld-importance", field_name: "重要性", type: 2 },
      { field_id: "fld-completed", field_name: "完成", type: 7 },
      { field_id: "fld-note", field_name: "备注", type: 1 },
      { field_id: "fld-attachment-meta", field_name: "附件元数据", type: 1 },
      { field_id: "fld-local-id", field_name: "本地ID", type: 1 },
      { field_id: "fld-created-at", field_name: "创建时间", type: 1 },
      { field_id: "fld-updated-at", field_name: "更新时间", type: 1 },
    ],
  };
}

function createRepo(fetcher: FeishuFetcher): FeishuBitableEntryRepository {
  return new FeishuBitableEntryRepository({
    accessToken: "access-token",
    appToken: "app-token",
    tableId: "tbl-token",
    fetcher,
  });
}

describe("FeishuBitableEntryRepository", () => {
  it("parses Feishu bitable records into entries", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/fields")) {
        return feishuResponse(existingFields());
      }
      return feishuResponse({
        items: [
          {
            record_id: "rec-1",
            fields: {
              标题: [{ text: "组会" }],
              日期: "2026-05-30",
              时间: "15:00",
              单位: "科研",
              类型: "持续",
              重要性: 5,
              完成: true,
              备注: "带材料",
              本地ID: "local-1",
              附件元数据: JSON.stringify([{ id: "att-1", storage: "local", name: "a.png", mime: "image/png", size: 1, createdAt: "2026-05-29T08:00:00.000Z" }]),
            },
          },
        ],
      });
    }) as FeishuFetcher;

    const entries = await createRepo(fetcher).list();

    expect(entries[0]).toMatchObject({
      id: "rec-1",
      localId: "local-1",
      title: "组会",
      date: "2026-05-30",
      time: "15:00",
      unit: "research",
      kind: "duration",
      importance: 5,
      completed: true,
      note: "带材料",
    });
    expect(entries[0].attachments[0]).toMatchObject({ name: "a.png", storage: "local" });
  });

  it("creates missing fields and writes create/update/delete requests", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      requests.push({ url, init });
      if (url.includes("/fields") && !init?.method) {
        return feishuResponse({ items: [{ field_id: "fld-title", field_name: "标题", type: 1 }] });
      }
      if (url.includes("/fields") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        return feishuResponse({ field: { field_id: `fld-${body.field_name}`, field_name: body.field_name, type: body.type } });
      }
      if (url.includes("/records") && init?.method === "POST") {
        return feishuResponse({ record: { record_id: "rec-new", fields: {} } });
      }
      if (url.includes("/records") && init?.method === "PUT") {
        return feishuResponse({ record: { record_id: "rec-1", fields: {} } });
      }
      if (url.includes("/records") && init?.method === "DELETE") {
        return feishuResponse({});
      }
      return feishuResponse({ items: [] });
    }) as FeishuFetcher;
    const repo = createRepo(fetcher);

    const created = await repo.create({
      title: "新事件",
      date: "2026-05-30",
      unit: "work",
      kind: "event",
      importance: 3,
      attachments: [],
    });
    await repo.update(makeEntry({ id: "rec-1", title: "改名", kind: "duration" }));
    await repo.delete("rec-1");

    expect(created.id).toBe("rec-new");
    const createdFields = requests
      .filter((request) => request.url.includes("/fields") && request.init?.method === "POST")
      .map((request) => JSON.parse(request.init?.body as string).field_name);
    expect(createdFields).toContain("日期");
    expect(createdFields).toContain("更新时间");

    const createBody = JSON.parse(
      requests.find((request) => request.url.includes("/records") && request.init?.method === "POST")?.init?.body as string,
    );
    expect(createBody.fields).toMatchObject({ 标题: "新事件", 日期: "2026-05-30", 类型: "事件", 重要性: 3 });

    const updateBody = JSON.parse(requests.find((request) => request.init?.method === "PUT")?.init?.body as string);
    expect(updateBody.fields).toMatchObject({ 标题: "改名", 类型: "持续" });
    expect(requests.at(-1)).toMatchObject({
      url: expect.stringContaining("/open-apis/bitable/v1/apps/app-token/tables/tbl-token/records/rec-1"),
      init: { method: "DELETE" },
    });
  });
});
