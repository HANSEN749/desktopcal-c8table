# DesktopCal Android Companion

This is the first installable Android companion package for DesktopCal.

## Current Capability

- Kotlin + Jetpack Compose app.
- Stores the c8table API token in Android app preferences.
- Reads entries from the same c8table table used by the desktop app.
- Ensures the shared DesktopCal c8table fields exist.
- Creates quick events with title, date, time, unit/source, type, and 1-5 importance.

The package does not yet implement background sync, Android notifications, local Room cache, or
attachment upload.

## Build

The repository path contains Chinese characters. On Windows, call the wrapper through PowerShell
instead of running `gradlew.bat` directly:

```powershell
powershell -ExecutionPolicy Bypass -File apps\android\build-debug.ps1
```

Output:

```text
apps\android\app\build\outputs\apk\debug\app-debug.apk
```

## Required Local Environment

- JDK 17.
- Android SDK.
- `ANDROID_HOME` or `ANDROID_SDK_ROOT`.
- Android SDK Platform 36.
- Android SDK Build-Tools 36.1.0.

Installed local paths on this machine:

```text
JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot
ANDROID_HOME=C:\Users\Administrator\AppData\Local\Android\Sdk
```
