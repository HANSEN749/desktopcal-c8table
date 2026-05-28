import { describe, expect, it } from "vitest";
import { makeEntry } from "../test/factories";
import {
  ENTRY_ENVELOPE_SCHEMA,
  TEABLE_JSON_FIELD_NAME,
  entryToEnvelope,
  parseTeableRecord,
} from "./entryEnvelope";

describe("Teable entry envelope parsing", () => {
  it("parses a Teable JSON text field into an Entry", () => {
    const source = makeEntry({
      id: "local-before-teable",
      localId: "entry-local-id",
      title: "组会",
      date: "2026-05-27",
      time: "15:00",
      attachments: [
        {
          id: "att-1",
          storage: "local",
          localBlobKey: "attachment:att-1",
          name: "photo.jpg",
          mime: "image/jpeg",
          size: 12345,
          createdAt: "2026-05-27T08:00:00.000Z",
        },
      ],
    });

    const entry = parseTeableRecord(
      {
        id: "rec-1",
        fields: {
          [TEABLE_JSON_FIELD_NAME]: JSON.stringify(entryToEnvelope(source)),
        },
      },
      "2026-05-27",
    );

    expect(entry).toMatchObject({
      id: "rec-1",
      localId: "entry-local-id",
      title: "组会",
      date: "2026-05-27",
      time: "15:00",
      attachments: [{ localBlobKey: "attachment:att-1", storage: "local" }],
    });
  });

  it("marks plain single-line text records as legacy entries", () => {
    const entry = parseTeableRecord(
      {
        id: "legacy-rec",
        fields: {
          [TEABLE_JSON_FIELD_NAME]: "手写旧记录",
        },
        createdTime: "2026-05-26T00:00:00.000Z",
      },
      "2026-05-27",
    );

    expect(entry).toMatchObject({
      id: "legacy-rec",
      title: "手写旧记录",
      date: "2026-05-26",
      isLegacy: true,
    });
  });

  it("ignores unrelated JSON instead of crashing", () => {
    const entry = parseTeableRecord(
      {
        id: "json-rec",
        fields: {
          [TEABLE_JSON_FIELD_NAME]: JSON.stringify({ schema: "something-else", title: "raw" }),
        },
      },
      "2026-05-27",
    );

    expect(entry).toMatchObject({
      id: "json-rec",
      isLegacy: true,
    });
  });

  it("uses the expected schema in serialized envelopes", () => {
    expect(entryToEnvelope(makeEntry()).schema).toBe(ENTRY_ENVELOPE_SCHEMA);
  });
});

