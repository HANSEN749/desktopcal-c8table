# Development

## 1 Prerequisites

- Windows 10/11
- uv
- Node.js 20+
- npm
- Microsoft Edge WebView2 Runtime
- Rust toolchain from rustup for Tauri dev/build

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
| `uv run --no-editable desktopcal build` | Build shared types, web UI, and Tauri bundle |
| `uv run --no-editable desktopcal test` | Run Python tests and React/Vitest tests |
| `uv run --no-editable desktopcal lint` | Run Python, TypeScript, and harness checks |
| `uv run --no-editable desktopcal harness lint` | Validate ECL harness structure |

## 4 Current Behavior

The app uses an `EntryRepository` boundary. With a locally configured c8table token, events are
stored in structured c8table fields using `fieldKeyType=name`. The repository automatically creates
the expected fields if they are missing and migrates older JSON rows from `单行文本` into those fields.
Without a token, event writes are blocked so c8table remains the single event backend.

The frontend polls c8table periodically; direct edits in the table flow back to the UI without a
manual sync step.

Attachments are stored locally in IndexedDB. Event records keep attachment metadata and local blob
keys; when the c8table attachment field exists, the repository can upload local attachment blobs.

Users choose a semantic unit/source in the drawer, and that unit decides the marker shape. The
event type decides fill: `持续` is solid and `事件` is hollow.

Teable token options:

- Enter the token in the sidebar connection panel at runtime.
- Or use a local, untracked Vite environment value named `VITE_TEABLE_TOKEN`.

## 5 Troubleshooting

- If Tauri cannot build, run `uv run --no-editable desktopcal doctor` first.
- If npm workspace commands fail, run `npm install` at the repository root.
- If WebView2 is missing, install the Evergreen WebView2 Runtime from Microsoft.
- If c8table requests fail, confirm the local token is present and has permission to create fields
  and write records in table `tbl2wWI7diI2vs5anMs`.
