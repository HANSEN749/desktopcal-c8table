# Evolution Constraint Language

ECL keeps DesktopCal changes understandable across multiple agent sessions.

## 1 Core Rule

Non-trivial work needs a visible change context before implementation. The active context lives in
`harness/changes/active/` and contains:

- `summary.md` for the short task identity and handoff.
- `spec.md` for what and why.
- `plan.md` for how.
- `tasks.md` for executable checklist items.
- `reviews/` for plan or code review notes.

## 2 Small Change vs Structured Change

Small changes can skip active-change files when they are local, low-risk, and easy to verify.

Structured changes require active-change tracking when they touch multiple modules, data models,
runtime behavior, security, build tooling, harness rules, or expected work exceeds about 20 minutes.

## 3 Workflow

1. Load `AGENTS.md`, this document, and any active change.
2. Confirm the requested work matches the active change, or create/park/close changes as needed.
3. Keep `spec.md` focused on goal, constraints, acceptance criteria, assumptions, and risks.
4. Keep `plan.md` focused on implementation path and validation commands.
5. Keep `tasks.md` updated during implementation.
6. Run the verification commands listed in the plan.
7. Update `docs/STATUS.md` before closing or handing off.

## 4 Harness Commands

Use the uv CLI:

```powershell
uv run --no-editable desktopcal harness new <name>
uv run --no-editable desktopcal harness reindex
uv run --no-editable desktopcal harness lint
uv run --no-editable desktopcal harness evolve-check
```

`close`, `park`, and `resume` are reserved commands and will be expanded after the bootstrap change.

## 5 Mechanical Checks

`uv run desktopcal harness lint` validates the required docs, active change files, generated index,
and UTF-8 readability for text files. Future iterations should add stronger semantic checks only
after repeated project evidence shows a need.
