import { describe, expect, it } from "vitest";
import { createMockEntries } from "./mockEntries";
import { groupUpcomingEntries, isUrgent } from "./upcoming";

describe("groupUpcomingEntries", () => {
  it("groups entries into today, tomorrow, and day-after buckets", () => {
    const today = "2026-05-25";
    const entries = createMockEntries(new Date(`${today}T08:00:00`));

    const groups = groupUpcomingEntries(entries, today, 3);

    expect(groups.map((group) => group.label)).toEqual(["today", "tomorrow", "dayAfter"]);
  });

  it("supports a one-week range", () => {
    const today = "2026-05-25";
    const entries = createMockEntries(new Date(`${today}T08:00:00`));

    const groups = groupUpcomingEntries(entries, today, 7);

    expect(groups).toHaveLength(3);
  });

  it("marks high-importance close duration items as urgent", () => {
    const today = "2026-05-25";
    const entries = createMockEntries(new Date(`${today}T08:00:00`));

    expect(isUrgent(entries[1], today)).toBe(true);
  });
});
