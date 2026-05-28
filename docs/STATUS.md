# Project Status

Last updated: 2026-05-28

## Current State

DesktopCal now has a c8table-backed event layer. The React UI can create, edit, delete, and quick
add events; double-clicking a date opens the right-side event drawer. Events are read from and
written to c8table through `TeableJsonEntryRepository`; the UI also polls c8table so table edits can
flow back into the frontend without a manual sync step.

The default navigation is `常用视图`, which shows a rolling window from 3 days before today through
11 days after today with larger day cards and denser event rows. `日历模式` keeps the month grid but
shows more visible event text, times, and markers per cell.

The drawer edits semantic event fields. Users choose a unit/source such as `单位`, `科研`, `评审`,
`个人`, or `其他`; the unit decides marker shape. The type field decides fill: `持续` is solid and
`事件` is hollow.

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
- Teable runtime token is intentionally local-only via browser local storage or `VITE_TEABLE_TOKEN`.
- Teable target: `https://c8table.com`, table `tbl2wWI7diI2vs5anMs`, field key type `name`.
- The repository creates structured c8table fields for 标题, 日期, 时间, 单位, 类型, 重要性, 备注,
  附件, 附件元数据, 本地ID, 创建时间, and 更新时间. Older JSON rows in `单行文本` are migrated into
  these fields and `单行文本` is rewritten as a readable title mirror.
- Without a token, event writes are blocked instead of using local event fallback storage.
- The Tauri shell is back to a normal decorated, taskbar-visible window. Desktop wallpaper
  attachment is not part of the current runnable mode.
- Android APK output: `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
- macOS Apple Silicon DMG packaging is configured and verified through
  `.github/workflows/build-macos-arm64.yml`. It must run on macOS infrastructure; Windows is not
  used to produce the DMG locally.
- Tauri release build succeeds.

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed, 5 files / 24 tests.
- `uv run --no-editable desktopcal test`: passed.
- `uv run --no-editable desktopcal lint`: passed.
- `uv run --no-editable desktopcal build`: passed and produced the Windows executable plus NSIS
  installer.
- `powershell -ExecutionPolicy Bypass -File apps\android\build-debug.ps1`: passed and produced a
  debug APK.
- Android `testDebugUnitTest`: passed with no current unit-test sources.
- Android APK signature verification with `apksigner`: passed using APK Signature Scheme v2.
- GitHub Actions `Build macOS arm64 DMG`: passed on run `26593082004`; artifact downloaded locally
  to `dist/macos-arm64/DesktopCal_0.1.0_aarch64.dmg`.
- Browser smoke check against `http://127.0.0.1:5173`: passed for date double-click, drawer
  visibility, unit-derived marker preview, time field, note field, attachment input, and translucent
  UI styling.

## Next Recommended Step

Run the desktop application and enter the Teable API token in the sidebar connection panel:

```powershell
uv run --no-editable desktopcal dev
```

Or launch the built release executable:

```powershell
apps\desktop\src-tauri\target\release\desktopcal.exe
```
