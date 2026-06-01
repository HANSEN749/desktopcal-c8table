# Project Status

Last updated: 2026-05-31

## Current State

DesktopCal now has a local-first event layer with optional c8table or Feishu Bitable sync. The
React UI can create, edit, delete, complete, and quick add calendar entries and todos;
double-clicking a date opens the right-side event drawer. Entries always write to the local
IndexedDB backup first. When a remote
backend is selected, `LocalFirstEntryRepository` syncs the same entries to c8table through
`TeableJsonEntryRepository` or to Feishu Bitable through `FeishuBitableEntryRepository`.

The default navigation is `常用视图`, which shows a rolling window from 3 days before today through
11 days after today with larger day cards and denser event rows. `日历模式` keeps the month grid but
shows more visible event text, times, and markers per cell. `时间记录` is now a compact list board
for high-volume work: unfinished current/future items are grouped by day, sorted by importance and
time, and completed items move into a collapsed history group.

The same React/Vite UI can run as a standalone web app or inside the Windows executable. OAuth login
supports c8table OAuth 2.0 PKCE with an OAuth Client ID from settings or
`VITE_TEABLE_OAUTH_CLIENT_ID`; manual API token entry remains available for local/internal use.

The drawer edits semantic entry fields. Users choose `日历` or `代办`. Calendar entries keep date,
optional time, and the existing `事件` / `截止` fill rule; todo entries use their real creation date
as the calendar anchor, have no time, and render as red dots that intensify by importance. Completed
todos render as gray hollow dots and leave the sidebar todo list. Clicking outside an open drawer
closes it.

The sidebar lower panel now shows the top five unfinished todos sorted by importance, creation
time, and title. Sidebar, common-view, month-calendar, and existing-todo drawer rows include a
quick `设为已办` action for incomplete todos; completed todos remain visible on their calendar anchor
date with the gray hollow marker.

The sidebar `后台数据库` button opens the configured remote table in the system default browser. If a
visual table page cannot be inferred correctly from API IDs, settings can store an explicit
`后台数据库 URL`; without a mounted remote table the button warns that the database cannot be
visualized.

The Windows desktop window starts maximized by default.

Attachments are attached to events as metadata. Attachment binary data is stored locally in
IndexedDB by `LocalAttachmentRepository`; c8table records store `storage`, `localBlobKey`, name,
mime, size, timestamps, and future Teable attachment ids when available.

Android companion work now has a first debug APK. `apps/android` is a Kotlin + Compose project that
stores the c8table token locally, ensures the shared fields exist, lists events, and quick-creates
events against the same table. The schema-first sync contract remains under `packages/protocol`.

## Active Change

Current active change: `harness/changes/active/summary.md`

## Known Environment Facts

- `uv` is installed.
- Node and npm are installed.
- WebView2 Runtime is installed.
- Tauri CLI is installed through npm dependencies.
- Rust/Cargo are installed through rustup and available when `%USERPROFILE%\.cargo\bin` is on PATH.
- Teable runtime tokens are intentionally local-only via browser local storage, OAuth PKCE session,
  or `VITE_TEABLE_TOKEN`.
- Teable target: `https://c8table.com`, table `tbl2wWI7diI2vs5anMs`, field key type `name`.
- Visual table URLs can be stored locally with `desktopcal.database.url`; this is not used for API
  sync and only controls the system-browser database shortcut.
- The repository creates structured c8table fields for 标题, 条目类型, 日期, 时间, 单位, 类型, 重要性,
  完成, 备注, 附件, 附件元数据, 本地ID, 创建时间, and 更新时间. Older JSON rows in `单行文本` are
  migrated into these fields and `单行文本` is rewritten as a readable title mirror.
- Feishu Bitable sync uses the official `/open-apis/bitable/v1/apps/:app_token/tables/:table_id`
  records and fields APIs. The user supplies an access token, app token, and table ID locally.
- Without a remote configuration, event writes stay fully functional in the local backup database.
- The Tauri shell is back to a normal decorated, taskbar-visible window. Desktop wallpaper
  attachment is not part of the current runnable mode.
- Android APK output: `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
- macOS Apple Silicon DMG packaging is configured and verified through
  `.github/workflows/build-macos-arm64.yml`. It must run on macOS infrastructure; Windows is not
  used to produce the DMG locally.
- Tauri release build succeeds.

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed, 9 files / 53 tests.
- `uv run --no-editable desktopcal test`: passed.
- `uv run --no-editable desktopcal lint`: passed.
- `uv run --no-editable desktopcal build`: passed and produced the Windows executable plus NSIS
  installer.
- `java -classpath .\gradle\wrapper\gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain assembleDebug`
  from `apps/android`: passed. Direct Java invocation avoids `gradlew.bat` classpath issues in this
  Chinese-path workspace.
- `powershell -ExecutionPolicy Bypass -File apps\android\build-debug.ps1`: passed and produced a
  debug APK.
- Android `testDebugUnitTest`: passed with no current unit-test sources.
- Android APK signature verification with `apksigner`: passed using APK Signature Scheme v2.
- GitHub Actions `Build macOS arm64 DMG`: passed on run `26593350848`; artifact downloaded locally
  to `dist/macos-arm64/DesktopCal_0.1.0_aarch64.dmg`.
- Vite dev port now defaults to `0.0.0.0:5600` to avoid Windows-reserved 5173 ranges and allow LAN
  web access during development.

## Next Recommended Step

Run the desktop application. It works immediately with the local backup database. Use settings to
choose `本地备用库`, `c8table`, or `飞书多维表格`:

```powershell
uv run --no-editable desktopcal dev
```

Or launch the built release executable:

```powershell
apps\desktop\src-tauri\target\release\desktopcal.exe
```
