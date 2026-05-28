# Plan

## Implementation

- Extend shared entry and attachment types for local and future Teable attachment storage.
- Add repository interfaces and implementations for Teable JSON records, local fallback events, and
  IndexedDB attachment blobs.
- Split the React app into layout, calendar, drawer, upcoming list, and report preview components.
- Wire create, update, delete, quick add, and attachment upload through repositories.
- Update active status docs to describe the new event layer.

## Validation

- `npm run typecheck`
- `npm test`
- `uv run --no-editable desktopcal test`
- `uv run --no-editable desktopcal lint`
- `uv run --no-editable desktopcal build`
