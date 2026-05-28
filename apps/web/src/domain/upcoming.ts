import type { Entry } from "@desktopcal/shared";
import { dayDiff } from "./date";

export type UpcomingGroupLabel = "today" | "tomorrow" | "dayAfter" | "later";

export interface UpcomingGroup {
  label: UpcomingGroupLabel;
  date: string;
  entries: Entry[];
}

const labelByOffset: Record<number, UpcomingGroupLabel> = {
  0: "today",
  1: "tomorrow",
  2: "dayAfter",
};

export function groupUpcomingEntries(
  entries: Entry[],
  today: string,
  rangeDays: 3 | 7 | 14,
): UpcomingGroup[] {
  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    const offset = dayDiff(today, entry.date);
    if (offset < 0 || offset > rangeDays) {
      continue;
    }
    const existing = grouped.get(entry.date) ?? [];
    existing.push(entry);
    grouped.set(entry.date, existing);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      label: labelByOffset[dayDiff(today, date)] ?? "later",
      entries: items.sort((a, b) => b.importance - a.importance || (a.time ?? "").localeCompare(b.time ?? "")),
    }));
}

export function isUrgent(entry: Entry, today: string): boolean {
  const offset = dayDiff(today, entry.date);
  return entry.kind === "duration" && entry.importance >= 4 && offset >= 0 && offset <= 2;
}
