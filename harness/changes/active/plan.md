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

## Validation

- `npm run typecheck`
- `npm test`
- `apps/android/gradlew.bat assembleDebug`
- `uv run --no-editable desktopcal test`
- `uv run --no-editable desktopcal lint`
- `uv run --no-editable desktopcal build`
- `uv run --no-editable desktopcal harness lint`
