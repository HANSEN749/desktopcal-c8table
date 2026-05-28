import type { Entry } from "@desktopcal/shared";
import type { ReactNode } from "react";

export type RepositoryMode = "teable" | "disconnected";
export type AppView = "calendar" | "time" | "reports" | "settings";

interface AppLayoutProps {
  activeView: AppView;
  entries: Entry[];
  quickAdd: ReactNode;
  drawer: ReactNode;
  children: ReactNode;
  onViewChange(view: AppView): void;
}

export function AppLayout({
  activeView,
  entries,
  quickAdd,
  drawer,
  children,
  onViewChange,
}: AppLayoutProps) {
  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <p className="eyebrow">DesktopCal</p>
          <h1>桌面日历</h1>
        </div>
        <nav className="sideNav" aria-label="Primary">
          <button
            className={activeView === "calendar" ? "navItem active" : "navItem"}
            type="button"
            onClick={() => onViewChange("calendar")}
          >
            日历总览
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
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Windows 桌面应用</p>
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
