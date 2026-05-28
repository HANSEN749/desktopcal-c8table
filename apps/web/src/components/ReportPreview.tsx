import type { Entry } from "@desktopcal/shared";
import { dayDiff } from "../domain/date";

interface ReportPreviewProps {
  entries: Entry[];
  today: string;
}

export function ReportPreview({ entries, today }: ReportPreviewProps) {
  const weeklyEntries = entries.filter((entry) => {
    const offset = dayDiff(today, entry.date);
    return offset >= 0 && offset <= 6;
  });
  const highImportance = weeklyEntries.filter((entry) => entry.importance >= 4).length;

  return (
    <section className="panel reportPanel">
      <div>
        <p className="eyebrow">周月报</p>
        <h3>本周摘要预览</h3>
      </div>
      <div className="reportStats">
        <div>
          <strong>{weeklyEntries.length}</strong>
          <span>本周事件</span>
        </div>
        <div>
          <strong>{highImportance}</strong>
          <span>高重要度</span>
        </div>
      </div>
      <div className="reportActions">
        <button type="button">导出 Markdown</button>
        <button type="button">导出 HTML</button>
      </div>
    </section>
  );
}

