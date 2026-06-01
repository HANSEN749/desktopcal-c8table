import type { Entry, EntryUnitId, EntryUnitProfile } from "@desktopcal/shared";
import { useMemo, type ReactNode } from "react";

export type RepositoryMode = "local" | "teable" | "feishu";
export type AppView = "common" | "calendar" | "time" | "reports" | "settings";

interface AppLayoutProps {
  activeView: AppView;
  entries: Entry[];
  today: string;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  databaseUrl?: string;
  quickAdd: ReactNode;
  drawer: ReactNode;
  children: ReactNode;
  onViewChange(view: AppView): void;
  onEditEntry(entry: Entry): void;
  onCompleteTodo(entry: Entry): void;
}

export function AppLayout({
  activeView,
  entries,
  today,
  unitProfiles,
  databaseUrl,
  quickAdd,
  drawer,
  children,
  onViewChange,
  onEditEntry,
  onCompleteTodo,
}: AppLayoutProps) {
  const todos = useMemo(() => selectSidebarTodos(entries), [entries]);

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
        <button
          className="miniStats databaseButton"
          type="button"
          aria-label="进入后台数据库"
          onClick={() => openDatabase(databaseUrl)}
        >
          <span>后台数据库</span>
        </button>
        <TodoListPanel
          todos={todos}
          unitProfiles={unitProfiles}
          onEditEntry={onEditEntry}
          onCompleteTodo={onCompleteTodo}
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

interface TodoListPanelProps {
  todos: Entry[];
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  onEditEntry(entry: Entry): void;
  onCompleteTodo(entry: Entry): void;
}

function TodoListPanel({ todos, unitProfiles, onEditEntry, onCompleteTodo }: TodoListPanelProps) {
  if (todos.length === 0) {
    return (
      <section className="todoPanel empty" aria-label="代办清单">
        <strong>暂无未完成待办</strong>
        <span>新建代办后，这里按重要性显示前 5 条。</span>
      </section>
    );
  }

  return (
    <section className="todoPanel" aria-label="代办清单">
      <strong className="todoPanelTitle">未完成待办</strong>
      <div className="todoList">
        {todos.map((entry) => {
          const unitProfile = unitProfiles[entry.unit] ?? unitProfiles.work;
          return (
            <div className="todoRowShell" key={entry.id}>
              <button
                className="todoRow"
                type="button"
                aria-label={`编辑代办：${entry.title}`}
                onClick={() => onEditEntry(entry)}
              >
                <span className={`marker todoMarker todoLevel${entry.importance}`} title="代办">
                  ●
                </span>
                <span className="todoRowBody">
                  <strong>{entry.title}</strong>
                  <span>{unitProfile.label}</span>
                </span>
                <em>L{entry.importance}</em>
              </button>
              <button
                className="todoQuickDoneButton sidebarTodoDone"
                type="button"
                title="设为已办"
                aria-label={`设为已办：${entry.title}`}
                onClick={() => onCompleteTodo(entry)}
              >
                ✓
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function selectSidebarTodos(entries: Entry[]): Entry[] {
  return entries
    .filter((entry) => entry.category === "todo" && !entry.completed)
    .sort(
      (left, right) =>
        right.importance - left.importance ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.title.localeCompare(right.title, "zh-Hans-CN"),
    )
    .slice(0, 5);
}

async function openDatabase(databaseUrl: string | undefined): Promise<void> {
  if (!databaseUrl) {
    window.alert("尚未挂载多维表格，无法可视化数据库");
    return;
  }
  try {
    const shell = window as Window & {
      __TAURI_INTERNALS__?: { invoke?: (command: string, args?: unknown) => Promise<unknown> };
      __TAURI__?: { core?: { invoke?: (command: string, args?: unknown) => Promise<unknown> } };
    };
    const invoke = shell.__TAURI_INTERNALS__?.invoke ?? shell.__TAURI__?.core?.invoke;
    if (invoke) {
      await invoke("open_external_url", { url: databaseUrl });
      return;
    }
  } catch {
    // Fall back to browser behavior below when the native shell command is unavailable.
  }
  window.open(databaseUrl, "_blank", "noopener,noreferrer");
}
