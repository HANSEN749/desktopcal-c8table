# DesktopCal Protocol

This folder holds cross-device protocol artifacts for the desktop and Android clients.

It is intentionally not an npm workspace yet. The first phase keeps the protocol as JSON Schema and
documentation so Android can be introduced without binding Gradle, npm, Rust, and Python build
chains together.

Current artifacts:

- `schemas/entry.v1.schema.json`: canonical event contract for desktop and Android.
