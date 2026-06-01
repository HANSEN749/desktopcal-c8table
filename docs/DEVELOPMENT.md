# Development

## 1 Prerequisites

- Windows 10/11
- uv
- Node.js 20+
- npm
- Microsoft Edge WebView2 Runtime
- Rust toolchain from rustup for Tauri dev/build
- Android SDK and JDK 17 are required for Android APK builds. Android Studio is optional unless you
  want the IDE or emulator UI.

## 2 Install

```powershell
uv sync --extra dev
npm install
uv run --no-editable desktopcal doctor
```

If `rustc` or `cargo` are missing, install Rust from `https://rustup.rs/`, restart the terminal,
and re-run doctor.

## 3 Commands

| Command | Description |
| --- | --- |
| `uv run --no-editable desktopcal doctor` | Check uv, Node, npm, Rust/Cargo, WebView2, and Tauri CLI |
| `uv run --no-editable desktopcal dev` | Start the Windows Tauri development window |
| `uv run --no-editable desktopcal web` | Start the standalone web app on `0.0.0.0:5600` by default |
| `npm run dev:web` | Same web dev server, useful when not using the uv CLI |
| `npm run preview:web` | Serve the already-built web app |
| `npm run build:web` | Build shared types and the standalone web app |
| `uv run --no-editable desktopcal build` | Build shared types, web UI, and Tauri bundle |
| `uv run --no-editable desktopcal test` | Run Python tests and React/Vitest tests |
| `uv run --no-editable desktopcal lint` | Run Python, TypeScript, and harness checks |
| `uv run --no-editable desktopcal harness lint` | Validate ECL harness structure |
| `powershell -ExecutionPolicy Bypass -File apps\android\build-debug.ps1` | Build the Android debug APK |

For any desktop-facing code or UI change, run `uv run --no-editable desktopcal build` before
handoff so `apps\desktop\src-tauri\target\release\desktopcal.exe` and the NSIS installer are fresh.
Only skip this for work explicitly scoped to Android, iOS, docs, or another non-Windows-desktop
target.

Android is intentionally not wired into root `npm run build` or `uv run desktopcal build`; desktop
verification must stay fast and stable. Use the explicit Android command when building the APK.

## 4 Current Behavior

The app uses an `EntryRepository` boundary. The default runtime is local-first: events are stored in
IndexedDB even when no remote backend is configured. Settings can switch the remote sync target to
c8table or Feishu Bitable.

With either a locally configured c8table token or a c8table OAuth PKCE session, events are stored in
structured c8table fields using `fieldKeyType=name`. The repository automatically creates the
expected fields if they are missing and migrates older JSON rows from `单行文本` into those fields.

With Feishu Bitable selected, the app uses the Feishu Bitable records and fields APIs with a locally
stored access token, app token, and table ID. Feishu fields are created when missing, and local-only
events are pushed to Feishu once the backend becomes available.

The frontend polls the selected remote backend periodically; direct edits in the table flow back to
the UI without a manual sync step. If remote calls fail, the local backup remains usable.

The main UI has three schedule surfaces: `常用视图` is the default rolling window from 3 days before
today through 11 days after today, `日历模式` keeps the month grid with denser event text, and
`时间记录` is a compact list board that prioritizes unfinished current/future work and pushes
completed items into a collapsed history group.

The Android package under `apps/android` is a Kotlin + Compose companion. The first APK stores a
c8table token locally, lists events from the shared table, ensures expected c8table fields exist,
and creates quick events.

Attachments are stored locally in IndexedDB. Event records keep attachment metadata and local blob
keys; when the c8table attachment field exists, the repository can upload local attachment blobs.

Users choose a semantic unit/source in the drawer, and that unit decides the marker shape. The
event type decides fill: `持续` is solid and `事件` is hollow.

Teable token options:

- Enter the token in the sidebar connection panel at runtime.
- Or use a local, untracked Vite environment value named `VITE_TEABLE_TOKEN`.
- For the standalone web app or the local Tauri executable, configure a c8table OAuth App Client ID
  in settings or with `VITE_TEABLE_OAUTH_CLIENT_ID`, then use the OAuth login button. The app uses
  PKCE and does not require a client secret in the browser.

Feishu Bitable options:

- In settings, choose `飞书多维表格`.
- Save an access token, app token, and table ID. Tokens are runtime/local configuration only.
- The default Feishu base URL is `https://open.feishu.cn`.

The Vite development port defaults to `5600` because some Windows installations reserve the 5173
range. It binds to `0.0.0.0` so the same web page can be opened from the local network. Override
with `VITE_DEV_PORT` or `VITE_DEV_HOST` if needed.

## 5 Troubleshooting

- If Tauri cannot build, run `uv run --no-editable desktopcal doctor` first.
- If npm workspace commands fail, run `npm install` at the repository root.
- If WebView2 is missing, install the Evergreen WebView2 Runtime from Microsoft.
- If c8table requests fail, confirm the local token is present and has permission to create fields
  and write records in table `tbl2wWI7diI2vs5anMs`.
- If Feishu requests fail, confirm the access token has Bitable field and record read/write
  permissions, and that the app token/table ID point to an editable table.
- If `gradlew.bat` fails under this Chinese workspace path, use `apps\android\build-debug.ps1`; it
  calls the Gradle wrapper through Java directly.
