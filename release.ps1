param(
    [ValidateSet("patch", "minor", "major")]
    [string]$BumpType = "patch"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Starting release ($BumpType) ===" -ForegroundColor Cyan

# --- Очистка папки dist ---
Write-Host "[CLEAN] Очищаем папку dist от старых файлов..." -ForegroundColor Yellow
if (Test-Path ".\dist") {
    Remove-Item -Path ".\dist\*" -Recurse -Force -ErrorAction SilentlyContinue
}

# --- Шаг 1/3: версия и тег ---
Write-Host "[1/3] Bumping version and pushing tag..." -ForegroundColor Yellow
npm version $BumpType --no-git-tag-version
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] npm version failed" -ForegroundColor Red; exit 1 }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version

git add .
git commit -m "chore: release v$version"
git tag "v$version"
git push --follow-tags origin HEAD
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] Failed to push" -ForegroundColor Red; exit 1 }

Write-Host "[OK] Version: v$version, tag pushed" -ForegroundColor Green

# --- Шаг 2/3: сборка ---
Write-Host ""
Write-Host "[2/3] Building Windows app..." -ForegroundColor Yellow
npm run build:win
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] Build failed" -ForegroundColor Red; exit 1 }

# Ищем .exe и .blockmap
$exeFile = Get-ChildItem -Path ".\dist" -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$blockmapFile = Get-ChildItem -Path ".\dist" -Filter "*.blockmap" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $exeFile) { Write-Host "[ERROR] .exe not found" -ForegroundColor Red; exit 1 }

$sizeMB = [math]::Round($exeFile.Length / 1MB, 2)
Write-Host "[OK] Built: $($exeFile.Name) ($sizeMB MB)" -ForegroundColor Green

# --- Проверка GitHub CLI ---
$hasGh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $hasGh) {
    Write-Host "[WARN] GitHub CLI not installed. Upload manually:" -ForegroundColor Yellow
    Write-Host "       $($exeFile.FullName)" -ForegroundColor White
    if ($blockmapFile) { Write-Host "       $($blockmapFile.FullName)" -ForegroundColor White }
    exit 0
}

# --- Шаг 3/3: релиз ---
Write-Host ""
Write-Host "[3/3] Creating GitHub release..." -ForegroundColor Yellow

# Формируем массив файлов для загрузки (exe + blockmap)
$filesToUpload = @($exeFile.FullName)
if ($blockmapFile) { $filesToUpload += $blockmapFile.FullName }

$releaseArgs = @(
    "release", "create", "v$version",
    "--title", "AB Runner v$version",
    "--generate-notes",
    "--latest"
) + $filesToUpload

& gh @releaseArgs
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] GitHub release failed" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "[DONE] Release v$version published!" -ForegroundColor Green
Write-Host "       https://github.com/DIGSON-2/ab-runner/releases/tag/v$version" -ForegroundColor Cyan