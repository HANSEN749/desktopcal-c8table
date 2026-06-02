import type { Entry, EntryUnitId, EntryUnitProfile } from "@desktopcal/shared";
import { getEntryMarkerSymbol } from "@desktopcal/shared";
import { useEffect, useMemo, useState } from "react";
import { addDays, dayDiff, toDateKey } from "../domain/date";
import { sortEntries } from "../repositories/EntryRepository";

interface CommonScheduleViewProps {
  entries: Entry[];
  today: string;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  onCreateAtDate(date: string): void;
  onEditEntry(entry: Entry): void;
  onCompleteTodo(entry: Entry): void;
}

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function dayOffsetLabel(offset: number): string {
  if (offset === 0) {
    return "今天";
  }
  if (offset === 1) {
    return "明天";
  }
  if (offset === 2) {
    return "后天";
  }
  return offset < 0 ? `${Math.abs(offset)} 天前` : `${offset} 天后`;
}

function nextEventDateLabel(entry: Entry, today: string): string {
  const offset = dayDiff(today, entry.date);
  const dateLabel = offset <= 2 ? dayOffsetLabel(offset) : entry.date.slice(5).replace("-", "/");
  return entry.time ? `${dateLabel} ${entry.time}` : dateLabel;
}

function isFutureCalendarEntry(entry: Entry, now: Date): boolean {
  if (entry.category !== "calendar" || entry.completed) {
    return false;
  }
  const today = toDateKey(now);
  if (entry.date < today) {
    return false;
  }
  if (entry.date > today) {
    return true;
  }
  if (!entry.time) {
    return false;
  }
  return entry.time > `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function CommonScheduleView({
  entries,
  today,
  unitProfiles,
  onCreateAtDate,
  onEditEntry,
  onCompleteTodo,
}: CommonScheduleViewProps) {
  const [now, setNow] = useState(() => new Date());
  const days = useMemo(() => {
    const base = new Date(`${today}T00:00:00`);
    return Array.from({ length: 15 }, (_, index) => addDays(base, index - 3));
  }, [today]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of sortEntries(entries)) {
      if (entry.completed && entry.category !== "todo") {
        continue;
      }
      const offset = dayDiff(today, entry.date);
      if (offset < -3 || offset > 11) {
        continue;
      }
      const items = map.get(entry.date) ?? [];
      items.push(entry);
      map.set(entry.date, items);
    }
    return map;
  }, [entries, today]);

  const visibleCount = [...entriesByDate.values()].reduce((count, items) => count + items.length, 0);
  const nextCalendarEntry = useMemo(
    () => sortEntries(entries).find((entry) => isFutureCalendarEntry(entry, now)),
    [entries, now],
  );

  return (
    <section className="commonPane" aria-label="Common schedule">
      <div className="paneHeader commonHeader">
        <div>
          <p className="eyebrow">常用视图</p>
          <h3>前 3 天到后 11 天</h3>
        </div>
        <div className="commonHeaderStatus">
          <span>{visibleCount > 0 ? `${visibleCount} 条可见事件` : "近期暂无事件"}</span>
          {nextCalendarEntry ? (
            <button className="nextDatedEvent" type="button" onClick={() => onEditEntry(nextCalendarEntry)}>
              <span>下一个明确日期事件</span>
              <em>{nextEventDateLabel(nextCalendarEntry, today)}</em>
              <strong>{nextCalendarEntry.title}</strong>
            </button>
          ) : (
            <div className="nextDatedEvent empty">
              <span>下一个明确日期事件</span>
              <em>暂无</em>
              <strong>从快速输入添加</strong>
            </div>
          )}
        </div>
      </div>
      <div className="commonDayGrid">
        {days.map((day) => {
          const dateKey = toDateKey(day);
          const dayEntries = entriesByDate.get(dateKey) ?? [];
          const offset = dayDiff(today, dateKey);
          return (
            <article
              className={`commonDayCard${dateKey === today ? " today" : ""}${offset < 0 ? " past" : ""}`}
              data-testid={`common-day-${dateKey}`}
              key={dateKey}
              onDoubleClick={() => onCreateAtDate(dateKey)}
              tabIndex={0}
            >
              <div className="commonDayHeader">
                <div>
                  <strong>{dateKey.slice(5).replace("-", "/")}</strong>
                  <span>周{weekdayLabels[day.getDay()]}</span>
                </div>
                <div>
                  <em>{dayOffsetLabel(offset)}</em>
                  {dayEntries.length > 0 ? <span>{dayEntries.length} 条</span> : null}
                </div>
              </div>
              <div className="commonEntryList">
                {dayEntries.length === 0 ? <p className="commonEmpty">双击添加</p> : null}
                {dayEntries.slice(0, 10).map((entry) => {
                  const unitProfile = unitProfiles[entry.unit] ?? unitProfiles.work;
                  return (
                    <div
                      className={entry.category === "todo" ? "commonEntryRow todoEntryRow" : "commonEntryRow"}
                      key={entry.id}
                    >
                      <button
                        className="commonEntry"
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
                        <span className="commonTime">{entry.category === "todo" ? "" : entry.time ?? "--:--"}</span>
                        <strong>{entry.title}</strong>
                      </button>
                      {entry.category === "todo" && !entry.completed ? (
                        <button
                          className="todoQuickDoneButton calendarTodoDone"
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
                {dayEntries.length > 10 ? <span className="commonMore">还有 {dayEntries.length - 10} 条</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
