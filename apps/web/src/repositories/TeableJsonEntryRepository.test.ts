import { describe, expect, it, vi } from "vitest";
import { makeEntry } from "../test/factories";
import { TeableJsonEntryRepository, type Fetcher } from "./TeableJsonEntryRepository";
import { TEABLE_JSON_FIELD_NAME, entryToEnvelope } from "./entryEnvelope";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function existingFields() {
  return [
    { id: "fld-primary", name: TEABLE_JSON_FIELD_NAME, type: "singleLineText" },
    { id: "fld-title", name: "标题", type: "singleLineText" },
    { id: "fld-date", name: "日期", type: "date" },
    { id: "fld-time", name: "时间", type: "singleLineText" },
    { id: "fld-unit", name: "单位", type: "singleSelect" },
    { id: "fld-kind", name: "类型", type: "singleSelect" },
    { id: "fld-importance", name: "重要性", type: "rating" },
    { id: "fld-note", name: "备注", type: "longText" },
    { id: "fld-attachments", name: "附件", type: "attachment" },
    { id: "fld-attachment-meta", name: "附件元数据", type: "longText" },
    { id: "fld-local-id", name: "本地ID", type: "singleLineText" },
    { id: "fld-created-at", name: "创建时间", type: "date" },
    { id: "fld-updated-at", name: "更新时间", type: "date" },
  ];
}

describe("TeableJsonEntryRepository", () => {
  it("parses structured Teable fields into entries", async () => {
    let requestedUrl = "";
    const fetcher = (async (input: RequestInfo | URL) => {
      requestedUrl = input.toString();
      if (requestedUrl.includes("/field")) {
        return jsonResponse(existingFields());
      }
      return jsonResponse({
        records: [
          {
            id: "rec-1",
            fields: {
              标题: "组会",
              日期: "2026-05-27T00:00:00.000Z",
              时间: "15:00",
              单位: "单位",
              类型: "持续",
              重要性: 5,
              备注: "带材料",
              本地ID: "local-1",
              附件: [{ id: "att-1", name: "photo.jpg", mimetype: "image/jpeg", size: 123 }],
            },
          },
        ],
      });
    }) as Fetcher;

    const repo = new TeableJsonEntryRepository({ token: "token", fetcher });
    const entries = await repo.list();

    expect(entries[0]).toMatchObject({
      id: "rec-1",
      title: "组会",
      date: "2026-05-27",
      time: "15:00",
      unit: "work",
      kind: "duration",
      importance: 5,
      note: "带材料",
      attachments: [{ storage: "teable", name: "photo.jpg" }],
    });
    expect(requestedUrl).toContain("fieldKeyType=name");
  });

  it("reads Teable UTC date timestamps as Asia/Shanghai calendar dates", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/field")) {
        return jsonResponse(existingFields());
      }
      return jsonResponse({
        records: [
          {
            id: "rec-utc-date",
            fields: {
              标题: "巡检材料",
              日期: "2026-05-28T16:00:00.000Z",
              单位: "单位",
              类型: "事件",
              重要性: 3,
              本地ID: "local-utc-date",
            },
          },
        ],
      });
    }) as Fetcher;

    const repo = new TeableJsonEntryRepository({ token: "token", fetcher });
    const entries = await repo.list();

    expect(entries[0].date).toBe("2026-05-29");
  });

  it("keeps pure date strings unchanged", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/field")) {
        return jsonResponse(existingFields());
      }
      return jsonResponse({
        records: [
          {
            id: "rec-pure-date",
            fields: {
              标题: "纯日期",
              日期: "2026-05-29",
              单位: "单位",
              类型: "事件",
              重要性: 3,
              本地ID: "local-pure-date",
            },
          },
        ],
      });
    }) as Fetcher;

    const repo = new TeableJsonEntryRepository({ token: "token", fetcher });
    const entries = await repo.list();

    expect(entries[0].date).toBe("2026-05-29");
  });

  it("creates missing fields and migrates legacy JSON rows into structured columns", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const legacyEntry = makeEntry({ title: "旧 JSON 事件", date: "2026-05-27", kind: "duration" });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      requests.push({ url, init });
      if (url.includes("/field") && !init?.method) {
        return jsonResponse([{ id: "fld-primary", name: TEABLE_JSON_FIELD_NAME, type: "singleLineText" }]);
      }
      if (url.includes("/field") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        return jsonResponse({ id: `fld-${body.dbFieldName}`, name: body.name, type: body.type }, 201);
      }
      if (url.includes("/record?")) {
        return jsonResponse({
          records: [
            {
              id: "rec-json",
              fields: {
                [TEABLE_JSON_FIELD_NAME]: JSON.stringify(entryToEnvelope(legacyEntry)),
              },
            },
          ],
        });
      }
      if (init?.method === "PATCH") {
        return jsonResponse({ id: "rec-json", fields: {} });
      }
      return jsonResponse({ records: [] });
    }) as Fetcher;

    const repo = new TeableJsonEntryRepository({ token: "token", fetcher });
    const entries = await repo.list();

    expect(entries[0].title).toBe("旧 JSON 事件");
    const fieldCreates = requests.filter((request) => request.url.includes("/field") && request.init?.method === "POST");
    expect(fieldCreates.map((request) => JSON.parse(request.init?.body as string).name)).toEqual([
      "标题",
      "日期",
      "时间",
      "单位",
      "类型",
      "重要性",
      "完成",
      "备注",
      "附件",
      "附件元数据",
      "本地ID",
      "创建时间",
      "更新时间",
    ]);
    const migrationPatch = requests.find((request) => request.init?.method === "PATCH");
    const migrationBody = JSON.parse(migrationPatch?.init?.body as string);
    expect(migrationBody.record.fields).toMatchObject({
      [TEABLE_JSON_FIELD_NAME]: "旧 JSON 事件",
      标题: "旧 JSON 事件",
      类型: "持续",
      重要性: 3,
      完成: false,
    });
  });

  it("sends create, update, and delete requests with structured Teable fields", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      requests.push({ url, init });
      if (url.includes("/field")) {
        return jsonResponse(existingFields());
      }
      if (init?.method === "POST") {
        return jsonResponse({ records: [{ id: "rec-new", fields: {} }] });
      }
      if (init?.method === "PATCH") {
        return jsonResponse({ id: "rec-1", fields: {} });
      }
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return jsonResponse({ records: [] });
    }) as Fetcher;
    const repo = new TeableJsonEntryRepository({ token: "token", fetcher });

    const created = await repo.create({
      title: "新事件",
      date: "2026-05-27",
      unit: "work",
      kind: "event",
      importance: 3,
      attachments: [],
    });
    await repo.update(makeEntry({ id: "rec-1", title: "改名", kind: "duration" }));
    await repo.delete("rec-1");

    expect(created.id).toBe("rec-new");
    const createRequest = requests.find(
      (request) => request.url.includes("/record") && request.init?.method === "POST",
    );
    const createBody = JSON.parse(createRequest?.init?.body as string);
    expect(createBody.records[0].fields).toMatchObject({
      [TEABLE_JSON_FIELD_NAME]: "新事件",
      标题: "新事件",
      日期: "2026-05-27",
      单位: "单位",
      类型: "事件",
      重要性: 3,
    });

    const updateRequest = requests.find((request) => request.init?.method === "PATCH");
    const updateBody = JSON.parse(updateRequest?.init?.body as string);
    expect(updateBody.record.fields).toMatchObject({ 标题: "改名", 类型: "持续" });

    expect(requests.at(-1)).toMatchObject({
      url: expect.stringContaining("/api/table/tbl2wWI7diI2vs5anMs/record/rec-1"),
      init: { method: "DELETE" },
    });
  });
});
