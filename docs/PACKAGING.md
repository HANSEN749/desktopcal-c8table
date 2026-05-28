# Packaging

## Windows

Local command:

```powershell
uv run --no-editable desktopcal build
```

Installer output:

```text
apps\desktop\src-tauri\target\release\bundle\nsis\DesktopCal_0.1.0_x64-setup.exe
```

## Android

Local command:

```powershell
powershell -ExecutionPolicy Bypass -File apps\android\build-debug.ps1
```

APK output:

```text
apps\android\app\build\outputs\apk\debug\app-debug.apk
```

This is a debug package. It is installable for local testing, but it is not Play Store release
signed.

## macOS Apple Silicon

macOS DMG packaging must run on macOS. The repository includes:

```text
.github\workflows\build-macos-arm64.yml
```

Run it from GitHub Actions with `workflow_dispatch`, or push a `v*` tag. The workflow uses the
`macos-14` arm64 GitHub-hosted runner and uploads:

```text
DesktopCal-macos-arm64-dmg
```

The DMG is unsigned unless Apple signing credentials are added later.
