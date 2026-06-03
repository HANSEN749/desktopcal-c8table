import type { Entry, EntryUnitId, EntryUnitProfile } from "@desktopcal/shared";
import { getEntryMarkerSymbol, kindShortLabels } from "@desktopcal/shared";
import { useMemo, useState } from "react";
import { dayDiff } from "../domain/date";

interface TimeRecordBoardProps {
  entries: Entry[];
  today: string;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  onEditEntry(entry: Entry): void;
  onToggleCompleted(entry: Entry): void;
}

type TimeFilter = "today" | "3" | "7" | "14" | "all" | "date";

interface RecordGroup {
  key: string;
  title: string;
  subtitle: string;
  entries: Entry[];
}

const maxCollapsedRows = 10;

export function TimeRecordBoard({
  entries,
  today,
  unitProfiles,
  onEditEntry,
  onToggleCompleted,
}: TimeRecordBoardProps) {
  const [filter, setFilter] = useState<TimeFilter>("14");
  const [selectedDate, setSelectedDate] = useState(today);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set(["completed"]));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  const groups = useMemo(
    () => buildRecordGroups(entries, today, filter, selectedDate),
    [entries, filter, selectedDate, today],
  );

  const visibleCount = groups.reduce((count, group) => count + group.entries.length, 0);

  function toggleGroup(key: string) {
    setClosedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function expandGroup(key: string) {
    setExpandedGroups((current) => new Set(current).add(key));
  }

  return (
    <section className="panel fullPanel timeBoard" aria-label="Time records">
      <div className="paneHeader timeBoardHeader">
        <div>
          <p className="eyebrow">时间记录</p>
          <h3>当前与后续</h3>
        </div>
        <div className="timeBoardTools">
          <div className="segments" role="group" aria-label="时间范围">
            {[
              ["today", "今天"],
              ["3", "3天"],
              ["7", "1周"],
              ["14", "2周"],
              ["all", "全部"],
            ].map(([value, label]) => (
              <button
                className={filter === value ? "segment active" : "segment"}
                key={value}
                type="button"
                onClick={() => setFilter(value as TimeFilter)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            aria-label="选择日期"
            className={filter === "date" ? "dateFilter active" : "dateFilter"}
            onChange={(event) => {
              setSelectedDate(event.currentTarget.value);
              setFilter("date");
            }}
            type="date"
            value={selectedDate}
          />
        </div>
      </div>

      <div className="timeBoardSummary">
        <strong>{visibleCount}</strong>
        <span>条可见事件；未完成优先，已完成自动下沉</span>
      </div>

      <div className="timeGroupList">
        {groups.length === 0 ? <p className="emptyState">当前范围暂无事件</p> : null}
        {groups.map((group) => {
          const isClosed = closedGroups.has(group.key);
          const isExpanded = expandedGroups.has(group.key);
          const rows = isExpanded ? group.entries : group.entries.slice(0, maxCollapsedRows);
          return (
            <article className="timeGroup" key={group.key}>
              <button className="timeGroupHeader" type="button" onClick={() => toggleGroup(group.key)}>
                <span>{isClosed ? "+" : "-"}</span>
                <strong>{group.title}</strong>
                <em>{group.subtitle}</em>
                <b>{group.entries.length} 条</b>
              </button>
              {!isClosed ? (
                <div className="timeRows">
                  {rows.map((entry) => (
                    <TimeRecordRow
                      entry={entry}
                      key={entry.id}
                      unitProfiles={unitProfiles}
                      onEditEntry={onEditEntry}
                      onToggleCompleted={onToggleCompleted}
                    />
                  ))}
                  {group.entries.length > rows.length ? (
                    <button className="timeMoreButton" type="button" onClick={() => expandGroup(group.key)}>
                      还有 {group.entries.length - rows.length} 条，展开全部
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TimeRecordRow({
  entry,
  unitProfiles,
  onEditEntry,
  onToggleCompleted,
}: {
  entry: Entry;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  onEditEntry(entry: Entry): void;
  onToggleCompleted(entry: Entry): void;
}) {
  const unitProfile = unitProfiles[entry.unit] ?? unitProfiles.work;
  return (
    <div
      className={entry.completed ? "timeRecordRow completed" : "timeRecordRow"}
      onClick={() => onEditEntry(entry)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEditEntry(entry);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <button
        aria-label={entry.completed ? `恢复 ${entry.title}` : `完成 ${entry.title}`}
        className={entry.completed ? "doneToggle active" : "doneToggle"}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleCompleted(entry);
        }}
      >
        {entry.completed ? "✓" : ""}
      </button>
      <span className={`marker level${entry.importance}`} title={unitProfile.label}>
        {getEntryMarkerSymbol(unitProfile.shape, entry.kind)}
      </span>
      <span className="timeRecordDate">{entry.date}</span>
      <span className="timeRecordTime">{entry.time ?? "--:--"}</span>
      <strong>{entry.title}</strong>
      <span className="unitLabel">{unitProfile.label}</span>
      <span className="kind">{kindShortLabels[entry.kind]}</span>
      <span className="importance">L{entry.importance}</span>
      {entry.attachments.length > 0 ? (
        <span className="attachmentCount">{entry.attachments.length}</span>
      ) : null}
    </div>
  );
}

function buildRecordGroups(
  entries: Entry[],
  today: string,
  filter: TimeFilter,
  selectedDate: string,
): RecordGroup[] {
  const visible = entries.filter(
    (entry) => entry.category !== "todo" && matchesFilter(entry, today, filter, selectedDate),
  );
  const pendingByDate = new Map<string, Entry[]>();
  const overdue: Entry[] = [];
  const completed: Entry[] = [];

  for (const entry of visible) {
    const offset = dayDiff(today, entry.date);
    if (entry.completed) {
      completed.push(entry);
      continue;
    }
    if (offset < 0 && filter !== "date") {
      overdue.push(entry);
      continue;
    }
    const dayEntries = pendingByDate.get(entry.date) ?? [];
    dayEntries.push(entry);
    pendingByDate.set(entry.date, dayEntries);
  }

  const dayGroups = [...pendingByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      key: `date:${date}`,
      title: dayTitle(today, date),
      subtitle: date,
      entries: sortBoardEntries(items),
    }));

  const groups: RecordGroup[] = [...dayGroups];
  if (overdue.length > 0) {
    groups.push({
      key: "overdue",
      title: "逾期未完成",
      subtitle: "过去日期但未完成",
      entries: sortBoardEntries(overdue),
    });
  }
  if (completed.length > 0) {
    groups.push({
      key: "completed",
      title: "已完成 / 历史",
      subtitle: "完成事项自动下沉",
      entries: sortCompletedEntries(completed),
    });
  }
  return groups;
}

function matchesFilter(entry: Entry, today: string, filter: TimeFilter, selectedDate: string): boolean {
  if (filter === "date") {
    return entry.date === selectedDate;
  }
  if (filter === "all") {
    return true;
  }
  const offset = dayDiff(today, entry.date);
  if (offset < 0) {
    return !entry.completed;
  }
  const days = filter === "today" ? 0 : Number(filter);
  return offset <= days;
}

function sortBoardEntries(entries: Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) =>
      b.importance - a.importance ||
      timeRank(a).localeCompare(timeRank(b)) ||
      a.date.localeCompare(b.date) ||
      a.title.localeCompare(b.title),
  );
}

function sortCompletedEntries(entries: Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) ||
      b.importance - a.importance ||
      a.date.localeCompare(b.date) ||
      a.title.localeCompare(b.title),
  );
}

function timeRank(entry: Entry): string {
  return entry.time?.trim() || "99:99";
}

function dayTitle(today: string, date: string): string {
  const offset = dayDiff(today, date);
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
