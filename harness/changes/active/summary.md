# teable-backed-event-layer

Status: active

Replace the in-memory mock calendar with a repository-backed event layer that syncs structured
c8table records, auto-creates missing table fields, migrates legacy JSON rows, and stores attachment
blobs locally in IndexedDB. The same active change also holds the Android companion package and
macOS arm64 packaging flow so cross-device work stays inside the ECL harness structure instead of
starting a separate untracked project flow.
