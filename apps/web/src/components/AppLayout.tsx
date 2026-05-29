import {
  getEntryMarkerSymbol,
  kindLabels,
  kindShortLabels,
  type Entry,
  type EntryUnitId,
  type EntryUnitProfile,
} from "@desktopcal/shared";
import { useMemo, type ReactNode } from "react";
import { dayDiff } from "../domain/date";

export type RepositoryMode = "local" | "teable" | "feishu";
export type AppView = "common" | "calendar" | "time" | "reports" | "settings";

interface AppLayoutProps {
  activeView: AppView;
  entries: Entry[];
  today: string;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  quickAdd: ReactNode;
  drawer: ReactNode;
  children: ReactNode;
  onViewChange(view: AppView): void;
  onEditEntry(entry: Entry): void;
}

export function AppLayout({
  activeView,
  entries,
  today,
  unitProfiles,
  quickAdd,
  drawer,
  children,
  onViewChange,
  onEditEntry,
}: AppLayoutProps) {
  const nearestEntry = useMemo(() => findNearestEntry(entries, today), [entries, today]);

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <p className="eyebrow">DesktopCal</p>
          <h1>桌面日历</h1>
        </div>
        <nav className="sideNav" aria-label="Primary">
          <button
            className={activeView === "common" ? "navItem active" : "navItem"}
            type="button"
            onClick={() => onViewChange("common")}
          >
            常用视图
          </button>
          <button
            className={activeView === "calendar" ? "navItem active" : "navItem"}
            type="button"
            onClick={() => onViewChange("calendar")}
          >
            日历模式
          </button>
          <button
            className={activeView === "time" ? "navItem active" : "navItem"}
            type="button"
            onClick={() => onViewChange("time")}
          >
            时间记录
          </button>
          <button
            className={activeView === "reports" ? "navItem active" : "navItem"}
            type="button"
            onClick={() => onViewChange("reports")}
          >
            周月报
          </button>
          <button
            className={activeView === "settings" ? "navItem active" : "navItem"}
            type="button"
            onClick={() => onViewChange("settings")}
          >
            设置
          </button>
        </nav>
        <section className="miniStats" aria-label="Event stats">
          <strong>{entries.length}</strong>
          <span>表格事件</span>
        </section>
        <NearestEventCard
          entry={nearestEntry}
          today={today}
          unitProfiles={unitProfiles}
          onEditEntry={onEditEntry}
        />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Windows / Web / Android 同步</p>
            <h2>日历、待办与周月报</h2>
          </div>
          {quickAdd}
        </header>
        {children}
      </section>
      {drawer}
    </main>
  );
}

interface NearestEventCardProps {
  entry: Entry | undefined;
  today: string;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  onEditEntry(entry: Entry): void;
}

function NearestEventCard({ entry, today, unitProfiles, onEditEntry }: NearestEventCardProps) {
  if (!entry) {
    return (
      <section className="nearestEventPanel empty" aria-label="最近事件">
        <p className="nearestLabel">最近事件</p>
        <strong>暂无未完成事件</strong>
        <span>有新安排后，这里会显示离当前最近的一条。</span>
      </section>
    );
  }

  const unitProfile = unitProfiles[entry.unit] ?? unitProfiles.work;
  const relativeLabel = formatRelativeDate(today, entry.date);
  const attachmentCount = entry.attachments.length;

  return (
    <button
      className="nearestEventPanel"
      type="button"
      aria-label={`编辑最近事件：${entry.title}`}
      onClick={() => onEditEntry(entry)}
    >
      <span className="nearestLabel">最近事件</span>
      <span className="nearestDate">
        <strong>{entry.date}</strong>
        <em>{relativeLabel}</em>
      </span>
      <strong className="nearestTitle">{entry.title}</strong>
      <span className="nearestMeta">
        <span className={`marker level${entry.importance}`} title={unitProfile.label}>
          {getEntryMarkerSymbol(unitProfile.shape, entry.kind)}
        </span>
        <span>{entry.time ?? "--:--"}</span>
        <span>{kindShortLabels[entry.kind]}</span>
        <span>{unitProfile.label}</span>
        <span>L{entry.importance}</span>
      </span>
      <span className="nearestKind">{kindLabels[entry.kind]}</span>
      {entry.note ? <span className="nearestNote">{entry.note}</span> : null}
      {attachmentCount > 0 ? <span className="nearestAttachment">{attachmentCount} 个附件</span> : null}
    </button>
  );
}

function findNearestEntry(entries: Entry[], today: string): Entry | undefined {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const pending = entries.filter((entry) => !entry.completed);
  const upcoming = pending.filter((entry) => {
    if (entry.date < today) {
      return false;
    }
    if (entry.date !== today) {
      return true;
    }
    const entryMinutes = minutesFromTime(entry.time);
    return entryMinutes === undefined || entryMinutes >= currentMinutes;
  });

  return (
    [...upcoming].sort((left, right) => compareUpcomingEntries(left, right, today))[0] ??
    [...pending].sort((left, right) => compareFallbackEntries(left, right, today))[0]
  );
}

function compareUpcomingEntries(left: Entry, right: Entry, today: string): number {
  return (
    dayDiff(today, left.date) - dayDiff(today, right.date) ||
    timeSortValue(left.time) - timeSortValue(right.time) ||
    right.importance - left.importance ||
    left.title.localeCompare(right.title, "zh-Hans-CN")
  );
}

function compareFallbackEntries(left: Entry, right: Entry, today: string): number {
  return (
    Math.abs(dayDiff(today, left.date)) - Math.abs(dayDiff(today, right.date)) ||
    compareUpcomingEntries(left, right, today)
  );
}

function minutesFromTime(time: string | undefined): number | undefined {
  if (!time) {
    return undefined;
  }
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function timeSortValue(time: string | undefined): number {
  return minutesFromTime(time) ?? 24 * 60;
}

function formatRelativeDate(today: string, date: string): string {
  const diff = dayDiff(today, date);
  if (diff === 0) {
    return "今天";
  }
  if (diff === 1) {
    return "明天";
  }
  if (diff === 2) {
    return "后天";
  }
  if (diff === -1) {
    return "昨天";
  }
  return diff < 0 ? `${Math.abs(diff)} 天前` : `${diff} 天后`;
}
