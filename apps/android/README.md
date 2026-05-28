# Android App Boundary

This directory is reserved for the Android companion app.

The Android app should be introduced as a Kotlin + Jetpack Compose project only after the local
Android toolchain is confirmed. Until then, this directory documents the intended boundary without
adding Gradle files that would fail unrelated desktop verification.

## Intended Responsibility

- Mobile capture.
- Android notification reminders.
- Local Room cache.
- Local attachment/media storage.
- c8table pull and push through the shared protocol.

## Non-Responsibility

- Desktop report generation.
- c8table field administration beyond the shared event fields.
- Windows shell behavior.

## Planned Layers

```text
apps/android/
  app/                  # Android application module
  core/model/           # Kotlin models generated or mirrored from protocol schema
  core/sync/            # c8table sync client and WorkManager jobs
  core/storage/         # Room database and DataStore settings
  feature/capture/      # text, voice, photo, share target
  feature/now/          # mobile action list
  feature/detail/       # event edit flow
```

## Verification Gate Before Gradle Files

Before adding the real Android project, verify:

- JDK is installed and selected.
- Android Studio or Android SDK command-line tools are installed.
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` is configured.
- A minimal Compose project can build independently from root `npm` and `uv` commands.
