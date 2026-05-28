import type { Entry, EntryUnitId, EntryUnitProfile } from "@desktopcal/shared";
import { getEntryMarkerSymbol } from "@desktopcal/shared";
import { useMemo } from "react";
import { addDays, toDateKey } from "../domain/date";
import { sortEntries } from "../repositories/EntryRepository";

interface MonthCalendarProps {
  entries: Entry[];
  today: string;
  currentMonth: Date;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  onMonthChange(month: Date): void;
  onCreateAtDate(date: string): void;
  onEditEntry(entry: Entry): void;
}

function createMonthDays(current: Date): Date[] {
  const first = new Date(current.getFullYear(), current.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function monthTitle(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}

export function MonthCalendar({
  entries,
  today,
  currentMonth,
  unitProfiles,
  onMonthChange,
  onCreateAtDate,
  onEditEntry,
}: MonthCalendarProps) {
  const monthDays = useMemo(() => createMonthDays(currentMonth), [currentMonth]);
  const entriesByDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of sortEntries(entries)) {
      const items = map.get(entry.date) ?? [];
      items.push(entry);
      map.set(entry.date, items);
    }
    return map;
  }, [entries]);

  return (
    <section className="calendarPane" aria-label="Month calendar">
      <div className="paneHeader">
        <div>
          <p className="eyebrow">月历</p>
          <h3>{monthTitle(currentMonth)}</h3>
        </div>
        <div className="monthControls">
          <button
            type="button"
            onClick={() =>
              onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
            }
          >
            上月
          </button>
          <button type="button" onClick={() => onMonthChange(new Date())}>
            今天
          </button>
          <button
            type="button"
            onClick={() =>
              onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
            }
          >
            下月
          </button>
        </div>
      </div>
      <div className="weekdayRow">
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="monthGrid">
        {monthDays.map((day) => {
          const dateKey = toDateKey(day);
          const dayEntries = entriesByDate.get(dateKey) ?? [];
          const muted = day.getMonth() !== currentMonth.getMonth();
          const firstEntry = dayEntries[0];
          return (
            <article
              className={`dayCell${muted ? " muted" : ""}${dateKey === today ? " today" : ""}`}
              data-testid={`day-${dateKey}`}
              key={dateKey}
              onDoubleClick={() => onCreateAtDate(dateKey)}
              tabIndex={0}
            >
              <div className="cellTop">
                <strong>{day.getDate()}</strong>
                {dayEntries.length > 0 ? <span>{dayEntries.length} 条</span> : null}
              </div>
              <div className="cellMarks">
                {dayEntries.slice(0, 4).map((entry) => (
                  <span
                    className={`marker level${entry.importance}`}
                    key={entry.id}
                    title={(unitProfiles[entry.unit] ?? unitProfiles.work).label}
                  >
                    {getEntryMarkerSymbol((unitProfiles[entry.unit] ?? unitProfiles.work).shape, entry.kind)}
                  </span>
                ))}
              </div>
              {firstEntry ? (
                <button
                  className="cellEntryButton"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditEntry(firstEntry);
                  }}
                >
                  {firstEntry.title}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
