param(
  [string]$Configuration = "Release",
  [string]$BuildDir = "build/native-vs",
  [string]$OutDir = "dist/student-native"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildRoot = Join-Path $RepoRoot $BuildDir
$OutputRoot = Join-Path $RepoRoot $OutDir
$ShellExe = Join-Path $BuildRoot "desktop/shell/$Configuration/LumeSyncStudentShell.exe"
$ServiceExe = Join-Path $BuildRoot "desktop/service/$Configuration/LumeSyncStudentGuardSvc.exe"
$UiDist = Join-Path $RepoRoot "ui/student-host/dist"
$UiOutput = Join-Path $OutputRoot "ui/student-host/dist"
$SharedAssets = Join-Path $RepoRoot "shared/assets"
$UiAssetsOutput = Join-Path $UiOutput "assets"
$VerifyPasswordExe = Join-Path $RepoRoot "shared/build/verify-password.exe"

if (-not (Test-Path $ShellExe)) {
  throw "Missing shell binary: $ShellExe"
}

if (-not (Test-Path $ServiceExe)) {
  throw "Missing service binary: $ServiceExe"
}

if (-not (Test-Path $UiDist)) {
  throw "Missing UI dist directory: $UiDist"
}

if (Test-Path $OutputRoot) {
  Remove-Item -Recurse -Force $OutputRoot
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
New-Item -ItemType Directory -Force -Path $UiOutput | Out-Null

Copy-Item -Force $ShellExe (Join-Path $OutputRoot "LumeSyncStudentShell.exe")
Copy-Item -Force $ServiceExe (Join-Path $OutputRoot "LumeSyncStudentGuardSvc.exe")
Copy-Item -Recurse -Force (Join-Path $UiDist "*") $UiOutput

if (Test-Path $VerifyPasswordExe) {
  Copy-Item -Force $VerifyPasswordExe (Join-Path $OutputRoot "verify-password.exe")
} else {
  Write-Warning "verify-password.exe was not found. The installer will fall back to the default uninstall password."
}

if (Test-Path $SharedAssets) {
  New-Item -ItemType Directory -Force -Path $UiAssetsOutput | Out-Null
  Copy-Item -Recurse -Force (Join-Path $SharedAssets "*") $UiAssetsOutput
}

$LoaderCandidates = @(
  (Join-Path $BuildRoot "desktop/shell/$Configuration/WebView2Loader.dll"),
  (Join-Path $BuildRoot "WebView2Loader.dll"),
  (Join-Path $RepoRoot "WebView2Loader.dll")
)

$Loader = $LoaderCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($Loader) {
  Copy-Item -Force $Loader (Join-Path $OutputRoot "WebView2Loader.dll")
} else {
  Write-Warning "WebView2Loader.dll was not found. Copy it next to LumeSyncStudentShell.exe before deployment."
}

Write-Host "[native-package] Output: $OutputRoot"
