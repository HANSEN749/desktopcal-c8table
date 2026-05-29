import type { Entry, EntryUnitId, EntryUnitProfile } from "@desktopcal/shared";
import { getEntryMarkerSymbol, kindShortLabels } from "@desktopcal/shared";
import { useMemo } from "react";
import { addDays, dayDiff, toDateKey } from "../domain/date";
import { sortEntries } from "../repositories/EntryRepository";

interface CommonScheduleViewProps {
  entries: Entry[];
  today: string;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  onCreateAtDate(date: string): void;
  onEditEntry(entry: Entry): void;
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

export function CommonScheduleView({
  entries,
  today,
  unitProfiles,
  onCreateAtDate,
  onEditEntry,
}: CommonScheduleViewProps) {
  const days = useMemo(() => {
    const base = new Date(`${today}T00:00:00`);
    return Array.from({ length: 15 }, (_, index) => addDays(base, index - 3));
  }, [today]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of sortEntries(entries)) {
      if (entry.completed) {
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

  return (
    <section className="commonPane" aria-label="Common schedule">
      <div className="paneHeader commonHeader">
        <div>
          <p className="eyebrow">常用视图</p>
          <h3>前 3 天到后 11 天</h3>
        </div>
        <span>{visibleCount > 0 ? `${visibleCount} 条可见事件` : "近期暂无事件"}</span>
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
                    <button
                      className="commonEntry"
                      key={entry.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditEntry(entry);
                      }}
                    >
                      <span className={`marker level${entry.importance}`} title={unitProfile.label}>
                        {getEntryMarkerSymbol(unitProfile.shape, entry.kind)}
                      </span>
                      <span className="commonTime">{entry.time ?? "--:--"}</span>
                      <span className="commonMeta">{kindShortLabels[entry.kind]}</span>
                      <span className="commonUnit">{unitProfile.label}</span>
                      <strong>{entry.title}</strong>
                    </button>
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
