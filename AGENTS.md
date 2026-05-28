# DesktopCal Agent Guide

DesktopCal is a Windows-first desktop calendar, time-recording, and weekly/monthly report tool.

## 1 Quick Start

- [Architecture](docs/ARCHITECTURE.md) explains the uv command surface, Tauri shell, React UI, and shared types.
- [Development](docs/DEVELOPMENT.md) lists setup, verification, and troubleshooting commands.
- [ECL Workflow](docs/ECL.md) defines structured change tracking for multi-step work.
- [Current Status](docs/STATUS.md) is the handoff file when no active change overrides it.

## 2 Required Context Loading

1. Read this file first.
2. Read [docs/ECL.md](docs/ECL.md).
3. If `harness/changes/active/summary.md` exists, read the active change before editing code.
4. If no active change exists, read [docs/STATUS.md](docs/STATUS.md).
5. Read task-specific docs only after the active context is clear.

## 3 Command Surface

All human-facing commands go through uv. In this Windows workspace path, use `--no-editable`
because Python 3.11 cannot read editable `.pth` files containing Chinese paths under the default
system code page.

```powershell
uv run --no-editable desktopcal doctor
uv run --no-editable desktopcal dev
uv run --no-editable desktopcal build
uv run --no-editable desktopcal test
uv run --no-editable desktopcal lint
uv run --no-editable desktopcal harness lint
```

The Python CLI may call npm, Vite, Tauri, and Cargo underneath. Do not add a new top-level command
without wiring it through `uv run desktopcal`.

## 4 Project Layout

| Path | Purpose |
| --- | --- |
| `src/desktopcal/` | Python CLI for uv-managed orchestration and harness commands |
| `apps/desktop/` | Tauri 2 Windows desktop shell |
| `apps/web/` | React + TypeScript UI used by the Tauri shell |
| `packages/shared/` | Shared TypeScript domain types |
| `docs/` | Architecture, development, and ECL documentation |
| `harness/` | ECL change state, templates, archive, and evolution state |

## 5 Development Rules

- Keep desktop UI business behavior in `apps/web`.
- Keep native shell behavior in `apps/desktop/src-tauri`.
- Keep cross-cutting domain types in `packages/shared`.
- Keep orchestration and environment detection in `src/desktopcal`.
- Teable integration is planned but not part of the bootstrap MVP.

## 6 Verification By Task

| Task Type | Required Verification |
| --- | --- |
| Python CLI or harness | `uv run desktopcal test` and `uv run desktopcal harness lint` |
| React UI or shared types | `npm run typecheck` and `npm test` |
| Tauri shell | `uv run desktopcal doctor`, then `uv run desktopcal dev` |
| Cross-stack changes | `uv run desktopcal lint` |

## 7 Current MVP Boundary

The first runnable Windows build uses mock entries in memory. It should open a Tauri window, show
the upcoming list, show a month-calendar placeholder, and support quick-add into local React state.
Persistent storage, Teable API sync, attachment upload, reports, tray menus, and auto-start are
future structured changes.
