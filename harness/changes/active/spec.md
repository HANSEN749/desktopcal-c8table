# Spec

## Goal

Turn DesktopCal into a real event system backed by Teable records while keeping attachment files in
local IndexedDB until the target Teable table gains an attachment field.

## Acceptance Criteria

- Double-clicking a month-calendar date opens an event drawer prefilled with that date.
- The drawer can create and edit title, date, time, unit/source, importance, note, and attachments.
- The drawer supports top-level `日历` and `代办` entry categories; todo entries have no concrete
  time, use their real creation date as the calendar anchor date, and keep unit/source,
  importance, completion, notes, and attachments.
- Todo entries render as red dot markers that increase in intensity by importance and turn into
  gray hollow dots when completed.
- The sidebar lower panel shows the top five unfinished todos sorted by importance, creation time,
  and title instead of the previous nearest-event detail card.
- Sidebar todo rows, common-view todo rows, month-calendar todo rows, and the existing-todo drawer
  expose a quick `设为已办` action that marks the todo completed without requiring a full edit flow.
- Events can be marked completed; completed items are synced to c8table and pushed out of the
  current/future work focus.
- Shape is derived from unit/source rules, not directly selected.
- Empty/solid display is derived from event type: `事件` is hollow and `截止` is solid.
- Quick add parses natural-language input into proposed title, date, time, unit/source, type, and
  importance, then opens the drawer for human confirmation before saving.
- Month cells show event count, markers, and the first title; the upcoming list refreshes from the
  same event state.
- The main navigation separates `常用视图` and `日历模式`, with `常用视图` as the default.
- `常用视图` shows a rolling window from 3 days before today through 11 days after today, using
  larger day cards that can display at least 10 events per day before overflow summary text.
- `日历模式` keeps the month grid but uses denser cells that show multiple event titles, times, and
  markers instead of only the first title.
- `时间记录` is a compact list board for large event volumes, grouping unfinished current/future
  work by day, sorting by importance and time, and keeping completed/history items collapsed.
- UI code depends on an `EntryRepository` interface, not on Teable or IndexedDB directly.
- c8table is the source of truth for events; the frontend polls for table-side changes and blocks
  event writes until a local token or OAuth session exists.
- `TeableJsonEntryRepository` stores one event per Teable record using structured c8table fields and
  `fieldKeyType=name`.
- Missing c8table fields are created automatically for title, entry category, date, time, unit,
  type, importance, completed, note, attachments, attachment metadata, local id, created time, and
  updated time.
- Existing JSON rows in `Single line text` / `单行文本` are migrated into structured fields and the
  old text field is rewritten as a readable title mirror.
- Legacy text records are parsed without crashing and represented as legacy title events.
- `LocalAttachmentRepository` stores attachment blobs in IndexedDB and event records keep attachment
  metadata with local blob keys.
- API token handling is runtime/local only and no secret is committed to tracked files.
- The standalone web build and packaged Windows executable support c8table OAuth 2.0 PKCE login
  with a locally configured OAuth Client ID; browser clients never store an OAuth client secret.
- c8table OAuth sessions identify the authorized user via Teable's access-token user endpoint,
  support multiple saved OAuth accounts, and isolate local fallback/cache databases per active
  account so cross-device sync can later operate without cross-account data bleed.
- The sidebar `后台数据库` entry opens the configured remote table in the system default browser,
  and settings allow an explicit visual database URL because API table IDs alone are not enough to
  reliably reconstruct every c8table/Feishu UI route.
- Android companion work stays within the existing ECL harness architecture: protocol artifacts,
  product boundaries, Gradle project files, and build outputs are tracked through this change.
- Cross-device contracts are schema-first and use the same `desktopcal.entry.v1` event model for
  desktop, c8table, and the future Android app.
- The first Android package can be built locally as a debug APK and provides token storage, c8table
  event listing, and quick event creation against the same table.
- macOS Apple Silicon packaging has a reproducible GitHub Actions workflow that runs on macOS and
  emits a DMG artifact.

## Non-Goals

- No forced remote attachment migration until the table gains a usable attachment field.
- No background sync engine, conflict resolution UI, tray menu, auto-start, or report export.
- No Android Play Store release signing, remote attachment upload, or background sync worker in the
  first Android package.
- No local Windows-built macOS DMG. macOS DMG packaging must run on macOS infrastructure.

## Assumptions

- Teable Base URL is `https://c8table.com`.
- Teable Table ID is `tbl2wWI7diI2vs5anMs`.
- The current table may still have a legacy `单行文本` field, but it is not the primary event store.
- If no token is configured at runtime, the app blocks c8table writes instead of pretending to sync.
