# Build script for Memento AI with Velopack
# Run this locally to create a release package

param(
    [string]$Version = "0.1.0",
    [switch]$NoDelta,
    [string]$OutputDir = "velopack-output"
)

$ErrorActionPreference = "Stop"

Write-Host "Building Memento AI v$Version" -ForegroundColor Cyan

# Check for Velopack CLI
if (-not (Get-Command vpk -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Velopack CLI..." -ForegroundColor Yellow
    dotnet tool install -g vpk
}

# Build everything in release mode
Write-Host "Building daemon..." -ForegroundColor Yellow
cargo build --release -p memento-daemon
if ($LASTEXITCODE -ne 0) { throw "Daemon build failed" }

Write-Host "Building service-helper..." -ForegroundColor Yellow
cargo build --release -p service-helper
if ($LASTEXITCODE -ne 0) { throw "Service helper build failed" }

Write-Host "Building frontend..." -ForegroundColor Yellow
Push-Location app/frontend
npm ci
npm run build
Pop-Location

Write-Host "Building Tauri app..." -ForegroundColor Yellow
Push-Location app
# Use cargo tauri build to properly embed the frontend
# Just build, don't bundle (we use Velopack for packaging)
cargo tauri build --no-bundle
Pop-Location
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

# Prepare staging folder
Write-Host "Preparing release folder..." -ForegroundColor Yellow
$stagingDir = "release-staging"
if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
}
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

# Copy binaries
Copy-Item "target/release/tauri-app.exe" "$stagingDir/memento.exe"
Copy-Item "target/release/memento-daemon.exe" "$stagingDir/"
Copy-Item "target/release/service-helper.exe" "$stagingDir/"

# Copy ONNX Runtime DirectML.dll
# The ort crate downloads prebuilt binaries to AppData\Local\ort.pyke.io
$ortBinDir = Get-ChildItem -Path "$env:LOCALAPPDATA\ort.pyke.io\dfbin\x86_64-pc-windows-msvc" -Directory | Select-Object -First 1
if ($ortBinDir) {
    $directMlDll = Join-Path $ortBinDir.FullName "DirectML.dll"
    if (Test-Path $directMlDll) {
        Write-Host "Copying DirectML.dll from ort prebuilt..." -ForegroundColor Yellow
        Copy-Item $directMlDll "$stagingDir/"
    } else {
        Write-Warning "DirectML.dll not found at $directMlDll"
    }
} else {
    Write-Warning "ort prebuilt directory not found. DirectML.dll may be missing."
}

# Copy icons if present
if (Test-Path "app/src-tauri/icons") {
    Copy-Item -Recurse "app/src-tauri/icons" "$stagingDir/"
}

# Pack with Velopack
Write-Host "Packing with Velopack..." -ForegroundColor Yellow
$deltaMode = if ($NoDelta) { "None" } else { "BestSpeed" }
$packArgs = @(
    "pack",
    "--packId", "Memento",
    "--packVersion", $Version,
    "--packDir", $stagingDir,
    "--mainExe", "memento.exe",
    "--outputDir", $OutputDir,
    "--delta", $deltaMode
)

vpk @packArgs

# If a previous full package is available, create an explicit delta package.
if (-not $NoDelta -and (Test-Path "previous-release/*.nupkg")) {
    $prevPkg = Get-ChildItem "previous-release/*-full.nupkg" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    $newPkg = Get-ChildItem "$OutputDir/*-full.nupkg" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($prevPkg -and $newPkg) {
        $deltaFileName = $newPkg.Name -replace "-full\.nupkg$", "-delta.nupkg"
        $deltaPath = Join-Path $OutputDir $deltaFileName
        Write-Host "Generating delta package from: $($prevPkg.Name)" -ForegroundColor Gray
        vpk delta generate --mode BestSpeed --base $prevPkg.FullName --new $newPkg.FullName --output $deltaPath
    }
}

Write-Host "Done! Output in: $OutputDir" -ForegroundColor Green
Write-Host ""
Write-Host "Files created:" -ForegroundColor Cyan
Get-ChildItem $OutputDir | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  $($_.Name) ($size MB)"
}
