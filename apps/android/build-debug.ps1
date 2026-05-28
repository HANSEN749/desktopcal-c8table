$ErrorActionPreference = "Stop"

$javaHome = [Environment]::GetEnvironmentVariable("JAVA_HOME", "User")
if (-not $javaHome) {
  $javaHome = [Environment]::GetEnvironmentVariable("JAVA_HOME", "Machine")
}
if (-not $javaHome) {
  throw "JAVA_HOME is not set"
}

$androidHome = [Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")
if (-not $androidHome) {
  $androidHome = [Environment]::GetEnvironmentVariable("ANDROID_SDK_ROOT", "User")
}
if (-not $androidHome) {
  throw "ANDROID_HOME or ANDROID_SDK_ROOT is not set"
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir
try {
  $argsList = @(
    "-Dorg.gradle.appname=gradlew",
    "-classpath",
    "gradle\wrapper\gradle-wrapper.jar",
    "org.gradle.wrapper.GradleWrapperMain",
    "assembleDebug",
    "--no-daemon",
    "--console=plain"
  )
  & "$env:JAVA_HOME\bin\java.exe" @argsList
} finally {
  Pop-Location
}
