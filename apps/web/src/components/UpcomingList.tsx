import type { Entry, EntryUnitId, EntryUnitProfile } from "@desktopcal/shared";
import { getEntryMarkerSymbol, kindShortLabels } from "@desktopcal/shared";
import type { UpcomingGroup } from "../domain/upcoming";
import { isUrgent } from "../domain/upcoming";

interface UpcomingListProps {
  groups: UpcomingGroup[];
  today: string;
  range: 3 | 7 | 14;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  onRangeChange(range: 3 | 7 | 14): void;
  onEditEntry(entry: Entry): void;
}

const groupLabel = {
  today: "今日",
  tomorrow: "明日",
  dayAfter: "后日",
  later: "稍后",
};

export function UpcomingList({
  groups,
  today,
  range,
  unitProfiles,
  onRangeChange,
  onEditEntry,
}: UpcomingListProps) {
  return (
    <section className="panel upcomingPanel">
      <div className="paneHeader compact">
        <div>
          <p className="eyebrow">未来</p>
          <h3>近期安排</h3>
        </div>
        <div className="segments" role="group" aria-label="Upcoming range">
          {[3, 7, 14].map((value) => (
            <button
              key={value}
              className={range === value ? "segment active" : "segment"}
              type="button"
              onClick={() => onRangeChange(value as 3 | 7 | 14)}
            >
              {value === 3 ? "3天" : value === 7 ? "1周" : "2周"}
            </button>
          ))}
        </div>
      </div>
      <div className="upcomingList">
        {groups.length === 0 ? <p className="emptyState">近期暂无事件</p> : null}
        {groups.map((group) => (
          <article className="dayGroup" key={group.date}>
            <div className="dayHeader">
              <strong>{groupLabel[group.label]}</strong>
              <span>{group.date}</span>
            </div>
            {group.entries.map((entry) => (
              <UpcomingEntryRow
                entry={entry}
                key={entry.id}
                today={today}
                unitProfiles={unitProfiles}
                onEditEntry={onEditEntry}
              />
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}

interface UpcomingEntryRowProps {
  entry: Entry;
  today: string;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  onEditEntry(entry: Entry): void;
}

function UpcomingEntryRow({ entry, today, unitProfiles, onEditEntry }: UpcomingEntryRowProps) {
  const unitProfile = unitProfiles[entry.unit] ?? unitProfiles.work;

  return (
    <button className="entryRow" type="button" onClick={() => onEditEntry(entry)}>
      <span className={`marker level${entry.importance}`} title={unitProfile.label}>
        {getEntryMarkerSymbol(unitProfile.shape, entry.kind)}
      </span>
      <span className="kind">{kindShortLabels[entry.kind]}</span>
      <span className="unitLabel">{unitProfile.label}</span>
      <span className="importance">L{entry.importance}</span>
      <span className="entryTitle">{entry.title}</span>
      {entry.attachments.length > 0 ? (
        <span className="attachmentCount">{entry.attachments.length}</span>
      ) : null}
      {isUrgent(entry, today) ? <span className="urgent">!</span> : null}
    </button>
  );
}
