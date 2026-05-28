import type { Entry } from "@desktopcal/shared";

export function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "rec-1",
    localId: "local-1",
    unit: "work",
    title: "组会",
    date: "2026-05-27",
    shape: "circle",
    kind: "event",
    importance: 3,
    attachments: [],
    createdAt: "2026-05-27T08:00:00.000Z",
    updatedAt: "2026-05-27T08:00:00.000Z",
    ...overrides,
  };
}
