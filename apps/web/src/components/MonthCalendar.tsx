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
  onCompleteTodo(entry: Entry): void;
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
  onCompleteTodo,
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
              <div className="monthEntryList">
                {dayEntries.slice(0, 6).map((entry) => {
                  const unitProfile = unitProfiles[entry.unit] ?? unitProfiles.work;
                  return (
                    <div
                      className={entry.category === "todo" ? "monthEntryRow todoEntryRow" : "monthEntryRow"}
                      key={entry.id}
                    >
                      <button
                        className="monthEntryButton"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditEntry(entry);
                        }}
                      >
                        <span
                          className={
                            entry.category === "todo"
                              ? `marker todoMarker todoLevel${entry.importance}${entry.completed ? " completed" : ""}`
                              : `marker level${entry.importance}`
                          }
                          title={entry.category === "todo" ? "代办" : unitProfile.label}
                        >
                          {entry.category === "todo"
                            ? entry.completed
                              ? "○"
                              : "●"
                            : getEntryMarkerSymbol(unitProfile.shape, entry.kind)}
                        </span>
                        <span>{entry.category === "todo" ? "" : entry.time ?? ""}</span>
                        <strong>{entry.title}</strong>
                      </button>
                      {entry.category === "todo" && !entry.completed ? (
                        <button
                          className="todoQuickDoneButton calendarTodoDone monthTodoDone"
                          type="button"
                          title="设为已办"
                          aria-label={`设为已办：${entry.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onCompleteTodo(entry);
                          }}
                        >
                          ✓
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {dayEntries.length > 6 ? <span className="monthMore">+{dayEntries.length - 6}</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
