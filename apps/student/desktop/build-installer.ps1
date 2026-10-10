param(
  [string]$SourceDir = "dist/student-native",
  [string]$OutputDir = "dist/installer",
  [string]$OutputName = "LumeSync Student Native Setup 1.0.0.exe"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SourcePath = Resolve-Path (Join-Path $RepoRoot $SourceDir)
$OutputPath = Join-Path $RepoRoot $OutputDir
$ScriptPath = Join-Path $RepoRoot "desktop/installer/student-native.nsi"
$OutputFile = Join-Path $OutputPath $OutputName

if (-not (Test-Path $ScriptPath)) {
  throw "Missing NSIS script: $ScriptPath"
}

New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null

$MakensisCandidates = @(
  "makensis.exe",
  (Join-Path $env:LOCALAPPDATA "electron-builder/Cache/nsis/nsis-3.0.4.1/makensis.exe"),
  (Join-Path $env:LOCALAPPDATA "electron-builder/Cache/nsis/nsis-3.0.4.1/Bin/makensis.exe"),
  (Join-Path $env:LOCALAPPDATA "electron-builder/Cache/nsis/nsis-3.0.4.1-nsis-3.0.4.1/makensis.exe"),
  (Join-Path $env:LOCALAPPDATA "electron-builder/Cache/nsis/nsis-3.0.4.1-nsis-3.0.4.1/Bin/makensis.exe"),
  "C:/Program Files/NSIS/makensis.exe",
  "C:/Program Files (x86)/NSIS/makensis.exe"
)

$Makensis = $null
foreach ($Candidate in $MakensisCandidates) {
  if ($Candidate -eq "makensis.exe") {
    $Command = Get-Command makensis.exe -ErrorAction SilentlyContinue
    if ($Command) {
      $Makensis = $Command.Source
      break
    }
  } elseif (Test-Path $Candidate) {
    $Makensis = $Candidate
    break
  }
}

if (-not $Makensis) {
  throw "NSIS makensis.exe was not found. Install NSIS or place makensis.exe in PATH."
}

$Args = @(
  "/DSOURCE_DIR=$SourcePath",
  "/DOUTPUT_FILE=$OutputFile",
  $ScriptPath
)

Write-Host "[native-installer] Using NSIS: $Makensis"
Write-Host "[native-installer] Source: $SourcePath"
Write-Host "[native-installer] Output: $OutputFile"

& $Makensis @Args
if ($LASTEXITCODE -ne 0) {
  throw "makensis failed with exit code $LASTEXITCODE"
}

Write-Host "[native-installer] Created: $OutputFile"
