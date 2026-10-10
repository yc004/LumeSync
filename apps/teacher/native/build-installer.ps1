param(
  [string]$SourceDir = "dist/teacher-native",
  [string]$OutputDir = "dist/installer",
  [string]$OutputName = "LumeSync Teacher Native Setup 1.0.0.exe"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$PreferredSource = Join-Path $RepoRoot $SourceDir
$StagingSource = "$PreferredSource.staging"
if (Test-Path $StagingSource) {
  $SourcePath = Resolve-Path $StagingSource
} else {
  $SourcePath = Resolve-Path $PreferredSource
}
$OutputPath = Join-Path $RepoRoot $OutputDir
$ScriptPath = Join-Path $RepoRoot "native/installer/teacher-native.nsi"
$OutputFile = Join-Path $OutputPath $OutputName
$CoreInstallerName = "LumeSync Teacher Core Setup.exe"
$CoreInstallerPath = Join-Path $OutputPath $CoreInstallerName
$BootstrapperProject = Join-Path $RepoRoot "native/modern-bootstrapper/LumeSyncTeacherInstaller.csproj"
$BootstrapperPublishDir = Join-Path $OutputPath "bootstrapper-publish"
$BootstrapperExeName = "LumeSyncTeacherInstaller.exe"
$BootstrapperExePath = Join-Path $BootstrapperPublishDir $BootstrapperExeName

if (-not (Test-Path $ScriptPath)) {
  throw "Missing NSIS script: $ScriptPath"
}
if (-not (Test-Path $BootstrapperProject)) {
  throw "Missing bootstrapper project: $BootstrapperProject"
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

$NsisArgs = @(
  "/DSOURCE_DIR=$SourcePath",
  "/DOUTPUT_FILE=$CoreInstallerPath",
  $ScriptPath
)

Write-Host "[native-installer] Using NSIS: $Makensis"
Write-Host "[native-installer] Source: $SourcePath"
Write-Host "[native-installer] Core installer output: $CoreInstallerPath"

& $Makensis @NsisArgs
if ($LASTEXITCODE -ne 0) {
  throw "makensis failed with exit code $LASTEXITCODE"
}

if (Test-Path $BootstrapperPublishDir) {
  Remove-Item -LiteralPath $BootstrapperPublishDir -Recurse -Force
}

$DotnetArgs = @(
  "publish",
  $BootstrapperProject,
  "-c", "Release",
  "-r", "win-x64",
  "--self-contained", "true",
  "/p:PublishSingleFile=true",
  "/p:IncludeNativeLibrariesForSelfExtract=true",
  "/p:PayloadInstallerPath=$CoreInstallerPath",
  "-o", $BootstrapperPublishDir
)

Write-Host "[native-installer] Building modern bootstrapper..."
& dotnet @DotnetArgs
if ($LASTEXITCODE -ne 0) {
  throw "dotnet publish failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $BootstrapperExePath)) {
  throw "Bootstrapper executable not found: $BootstrapperExePath"
}

Copy-Item -LiteralPath $BootstrapperExePath -Destination $OutputFile -Force
Remove-Item -LiteralPath $CoreInstallerPath -Force

Write-Host "[native-installer] Created modern installer: $OutputFile"
