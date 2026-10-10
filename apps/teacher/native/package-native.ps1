param(
  [string]$Configuration = "Release",
  [string]$BuildDir = "build/native-vs",
  [string]$OutDir = "dist/teacher-native"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$WorkspaceRoot = Resolve-Path (Join-Path $RepoRoot "../..")
$BuildRoot = Join-Path $RepoRoot $BuildDir
$OutputRoot = Join-Path $RepoRoot $OutDir
$StagingRoot = "$OutputRoot.staging"
$RuntimeDepsRoot = Join-Path $RepoRoot ".native-runtime-deps"
$RuntimeNodeModulesDir = Join-Path $RuntimeDepsRoot "node_modules"

$ShellExe = Join-Path $BuildRoot "native/shell/$Configuration/LumeSyncTeacherShell.exe"
$ServerDir = Join-Path $RepoRoot "server"
$SharedPublicDir = Join-Path $RepoRoot "shared/public"
$SharedTeacherShellDir = Join-Path $RepoRoot "ui"
$SharedBuildDir = Join-Path $RepoRoot "shared/build"
$SharedAssetsDir = Join-Path $RepoRoot "shared/assets"
$CoreDir = if ($env:LUMESYNC_CORE_DIR) { Resolve-Path $env:LUMESYNC_CORE_DIR } else { Resolve-Path (Join-Path $WorkspaceRoot "packages/course-runtime") }
$CoreDistDir = Join-Path $CoreDir "dist"
$CorePackageJsonPath = Join-Path $CoreDir "package.json"
$CoreReadmePath = Join-Path $CoreDir "README.md"
$CoreLicensePath = Join-Path $CoreDir "LICENSE"
$PackageJsonPath = Join-Path $RepoRoot "package.json"
$WorkspacePackages = @(
  @{ Name = "classroom-protocol"; Path = "packages/classroom-protocol" },
  @{ Name = "course-format"; Path = "packages/course-format" },
  @{ Name = "native-contract"; Path = "packages/native-contract" },
  @{ Name = "student-ui"; Path = "apps/student/ui/classroom" }
)

function Stop-ProcessesUsingPath($TargetPath) {
  try {
    $normalized = [System.IO.Path]::GetFullPath($TargetPath)
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($normalized, [System.StringComparison]::OrdinalIgnoreCase)) -or
      ($_.CommandLine -and $_.CommandLine.Contains($normalized))
    }
    foreach ($process in $processes) {
      try {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
      } catch {
        Write-Warning "Failed to stop process $($process.ProcessId): $($_.Exception.Message)"
      }
    }
  } catch {
    Write-Warning "Failed to inspect processes for ${TargetPath}: $($_.Exception.Message)"
  }
}

function Remove-DirectoryWithRetry($TargetPath, $MaxAttempts = 5) {
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      if (-not (Test-Path $TargetPath)) { return }
      Remove-Item -Recurse -Force $TargetPath -ErrorAction Stop
      return
    } catch {
      if ($attempt -eq 1) {
        Stop-ProcessesUsingPath $TargetPath
      }
      if ($attempt -eq $MaxAttempts) {
        throw
      }
      Start-Sleep -Milliseconds (500 * $attempt)
    }
  }
}

function Prepare-RuntimeNodeModules {
  if (-not (Test-Path $PackageJsonPath)) {
    throw "Missing package.json: $PackageJsonPath"
  }

  if (Test-Path $RuntimeDepsRoot) {
    Remove-DirectoryWithRetry $RuntimeDepsRoot
  }

  New-Item -ItemType Directory -Force -Path $RuntimeDepsRoot | Out-Null
  # npm cannot install workspace:* from a detached staging directory. Collect
  # registry dependencies from the teacher and its local runtime packages.
  $registryDeps = @{}
  foreach ($manifestPath in @($PackageJsonPath) + @($WorkspacePackages | ForEach-Object { Join-Path (Join-Path $WorkspaceRoot $_.Path) "package.json" })) {
    if (-not (Test-Path $manifestPath)) { throw "Missing runtime package: $manifestPath" }
    $manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
    if (-not $manifest.dependencies) { continue }
    foreach ($dep in $manifest.dependencies.PSObject.Properties) {
      if ($dep.Value -notlike "workspace:*") {
        if ($registryDeps.ContainsKey($dep.Name) -and $registryDeps[$dep.Name] -ne $dep.Value) {
          throw "Conflicting runtime dependency $($dep.Name): $($registryDeps[$dep.Name]) / $($dep.Value)"
        }
        $registryDeps[$dep.Name] = $dep.Value
      }
    }
  }
  @{ name = "lumesync-teacher-runtime"; version = "1.0.0"; private = $true; dependencies = $registryDeps } |
    ConvertTo-Json -Depth 5 | Set-Content -Encoding Ascii (Join-Path $RuntimeDepsRoot "package.json")

  Push-Location $RuntimeDepsRoot
  try {
    npm install --omit=dev --no-audit --no-fund --package-lock=false | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Failed to install teacher runtime dependencies" }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $RuntimeNodeModulesDir)) {
    throw "Failed to prepare runtime node_modules at $RuntimeNodeModulesDir"
  }

  foreach ($entry in $WorkspacePackages) {
    $source = Join-Path $WorkspaceRoot $entry.Path
    $target = Join-Path $RuntimeNodeModulesDir "@lumesync/$($entry.Name)"
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    foreach ($name in @("package.json", "index.js", "index.mjs", "src", "lib", "dist")) {
      $item = Join-Path $source $name
      if (Test-Path $item) { Copy-Item -Recurse -Force $item (Join-Path $target $name) }
    }
  }

  $studentUi = Join-Path $RuntimeNodeModulesDir "@lumesync/student-ui"
  if (-not (Test-Path (Join-Path $studentUi "dist/current.json")) -or
      -not (Test-Path (Join-Path $studentUi "dist/manifest.json"))) {
    throw "Missing student UI build artifact; run pnpm --filter @lumesync/student-ui run build"
  }

  # Resolve from the installed layout, without the source workspace or NODE_PATH.
  $verify = 'for(const name of ["@lumesync/classroom-protocol","@lumesync/course-format/node","@lumesync/native-contract","@lumesync/student-ui/dist"]){require(name)}'
  Push-Location $RuntimeDepsRoot
  try {
    node -e $verify | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Teacher runtime package resolution failed" }
  } finally {
    Pop-Location
  }
}

function Prepare-CoreDist {
  if (-not (Test-Path $CorePackageJsonPath)) {
    throw "Missing core package.json: $CorePackageJsonPath"
  }

  if (Test-Path $CoreDistDir) {
    return
  }

  Push-Location $CoreDir
  try {
    pnpm run build | Out-Host
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $CoreDistDir)) {
    throw "Failed to build core SDK dist at $CoreDistDir"
  }
}

if (-not (Test-Path $ShellExe)) {
  throw "Missing shell binary: $ShellExe"
}

Prepare-RuntimeNodeModules
Prepare-CoreDist

if (Test-Path $StagingRoot) {
  Remove-DirectoryWithRetry $StagingRoot
}

New-Item -ItemType Directory -Force -Path $StagingRoot | Out-Null
Copy-Item -Force $ShellExe (Join-Path $StagingRoot "LumeSyncTeacherShell.exe")

foreach ($entry in @(
  @{ From = $ServerDir; To = "server" },
  @{ From = $SharedPublicDir; To = "shared/public" },
  @{ From = $SharedTeacherShellDir; To = "ui" },
  @{ From = $SharedBuildDir; To = "shared/build" },
  @{ From = $SharedAssetsDir; To = "shared/assets" },
  @{ From = $CoreDistDir; To = "core/dist" },
  @{ From = $CorePackageJsonPath; To = "core/package.json" },
  @{ From = $CoreReadmePath; To = "core/README.md" },
  @{ From = $CoreLicensePath; To = "core/LICENSE" },
  @{ From = $RuntimeNodeModulesDir; To = "node_modules" }
)) {
  if (Test-Path $entry.From) {
    $target = Join-Path $StagingRoot $entry.To
    New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
    Copy-Item -Recurse -Force $entry.From $target
  }
}

# Exercise the same resolver used by GET /student.html against the actual
# installer layout, including current.json, manifest and the entry file.
Push-Location $StagingRoot
try {
  $verifyStudentUi = 'const state=require("./server/src/student-ui").resolveStudentUi(); if(!state.ok){throw new Error(state.message)}; console.log("[native-package] student UI " + state.version)'
  node -e $verifyStudentUi | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Student UI cannot be served from the staged installer" }
} finally {
  Pop-Location
}

$LoaderCandidates = @(
  (Join-Path $BuildRoot "native/shell/$Configuration/WebView2Loader.dll"),
  (Join-Path $BuildRoot "WebView2Loader.dll"),
  (Join-Path $RepoRoot "WebView2Loader.dll")
)

$Loader = $LoaderCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($Loader) {
  Copy-Item -Force $Loader (Join-Path $StagingRoot "WebView2Loader.dll")
} else {
  Write-Warning "WebView2Loader.dll was not found. Copy it next to LumeSyncTeacherShell.exe before deployment."
}

$NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
  $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
}
if ($NodeCommand -and (Test-Path $NodeCommand.Source)) {
  Copy-Item -Force $NodeCommand.Source (Join-Path $StagingRoot "node.exe")
} else {
  Write-Warning "node.exe was not found in PATH. The installed teacher app may fail to start the local server on machines without Node.js."
}

$FinalOutput = $OutputRoot
if (Test-Path $OutputRoot) {
  try {
    Remove-DirectoryWithRetry $OutputRoot
    Move-Item -Force $StagingRoot $OutputRoot
  } catch {
    Write-Warning "Failed to replace $OutputRoot, keeping staging output at $StagingRoot. Error: $($_.Exception.Message)"
    $FinalOutput = $StagingRoot
  }
} else {
  Move-Item -Force $StagingRoot $OutputRoot
}

Write-Host "[native-package] Output: $FinalOutput"
if ($FinalOutput -ne $OutputRoot) {
  Write-Host "[native-package] Note: installer should use staging source: $FinalOutput"
}
