# Plan

## Implementation

- Extend shared entry and attachment types for local and future Teable attachment storage.
- Add repository interfaces and implementations for Teable JSON records, local fallback events, and
  IndexedDB attachment blobs.
- Split the React app into layout, calendar, drawer, upcoming list, and report preview components.
- Wire create, update, delete, quick add, and attachment upload through repositories.
- Update active status docs to describe the new event layer.
- Create a real Android Gradle/Compose project under `apps/android` after verifying the local JDK
  and Android SDK.
- Build a first Android debug APK with token storage, c8table list, and quick create.
- Add a macOS arm64 GitHub Actions packaging workflow for DMG artifacts because local Windows cannot
  produce a reliable Tauri macOS DMG.
- Add completed-state sync and convert `时间记录` into a high-density current/future list board.
- Add standalone web and packaged-exe OAuth PKCE login so browser clients can use c8table OAuth
  access tokens instead of manually entered API tokens.
- Add a top-level `日历` / `代办` category across shared types, c8table, Feishu, web UI, quick add,
  and Android parsing; show todo entries as red-dot calendar items and replace the sidebar nearest
  event card with an importance-sorted todo panel.
- Add quick `设为已办` actions for todo rows in the sidebar, common view, month calendar, and
  existing-todo drawer.
- Add a settings-backed visual database URL so the sidebar database entry can open the exact mounted
  c8table/Feishu page in the default browser instead of guessing from API IDs.

## Validation

- `npm run typecheck`
- `npm test`
- `java -classpath .\gradle\wrapper\gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain assembleDebug`
- `uv run --no-editable desktopcal test`
- `uv run --no-editable desktopcal lint`
- `uv run --no-editable desktopcal build`
- `uv run --no-editable desktopcal harness lint`
