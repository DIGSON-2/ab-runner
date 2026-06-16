param(
    [ValidateSet("patch", "minor", "major")]
    [string]$BumpType = "patch"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Starting release ($BumpType) ===" -ForegroundColor Cyan

# --- Шаг 0: Очистка ---
Write-Host "[CLEAN] Очищаем папку dist..." -ForegroundColor Yellow
if (Test-Path ".\dist") {
    Remove-Item -Path ".\dist\*" -Recurse -Force -ErrorAction SilentlyContinue
}

# --- Шаг 1/3: Версия и тег ---
Write-Host "[1/3] Bumping version and pushing tag..." -ForegroundColor Yellow

# Обновляем версию
npm version $BumpType --no-git-tag-version
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm version failed" -ForegroundColor Red
    exit 1
}

# Получаем новую версию из package.json
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version

# Коммитим изменения
git add .
git commit -m "chore: release v$version"
# Игнорируем ошибку, если коммитить нечего (хотя npm version всегда меняет файл)
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] git commit returned non-zero. Continuing..." -ForegroundColor Yellow
}

# Создаем тег
git tag "v$version"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to create tag v$version" -ForegroundColor Red
    exit 1
}

# ВАЖНО: Пушим коммит и тег ОТДЕЛЬНО. 
# Это гарантирует, что тег точно появится на сервере.
Write-Host "Pushing commit..."
git push origin HEAD
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to push commit" -ForegroundColor Red
    exit 1
}

Write-Host "Pushing tag v$version..."
git push origin "v$version"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to push tag v$version" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Version: v$version, tag pushed" -ForegroundColor Green

# --- Шаг 2/3: Сборка ---
Write-Host ""
Write-Host "[2/3] Building Windows app..." -ForegroundColor Yellow

# Очищаем кэш electron-builder, чтобы избежать ошибок с симлинками
$cachePath = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
if (Test-Path $cachePath) {
    Write-Host "[CACHE] Cleaning winCodeSign cache..." -ForegroundColor Gray
    Remove-Item -Recurse -Force $cachePath -ErrorAction SilentlyContinue
}

npm run build:win
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed (npm run build:win)" -ForegroundColor Red
    exit 1
}

# Ищем собранные файлы
$exeFile = Get-ChildItem -Path ".\dist" -Filter "*.exe" -ErrorAction SilentlyContinue |
Where-Object { $_.Name -notmatch "blockmap" -and $_.Name -notmatch "uninstaller" } |
Sort-Object LastWriteTime -Descending |
Select-Object -First 1

$blockmapFile = Get-ChildItem -Path ".\dist" -Filter "*.blockmap" -ErrorAction SilentlyContinue |
Select-Object -First 1

if (-not $exeFile) {
    Write-Host "[ERROR] .exe not found in dist/" -ForegroundColor Red
    exit 1
}

$sizeMB = [math]::Round($exeFile.Length / 1MB, 2)
Write-Host "[OK] Built: $($exeFile.Name)" -ForegroundColor Green
Write-Host "     Size: $sizeMB MB" -ForegroundColor Gray

# --- Проверка GitHub CLI ---
$hasGh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $hasGh) {
    Write-Host ""
    Write-Host "[WARN] GitHub CLI (gh) not installed!" -ForegroundColor Yellow
    Write-Host "       Install: winget install GitHub.cli" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[FILE] Ready for manual upload:" -ForegroundColor Cyan
    Write-Host "       $($exeFile.FullName)" -ForegroundColor White
    if ($blockmapFile) {
        Write-Host "       $($blockmapFile.FullName)" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "       Upload at: https://github.com/DIGSON-2/ab-runner/releases/new" -ForegroundColor Gray
    exit 0
}

# --- Шаг 3/3: Релиз ---
Write-Host ""
Write-Host "[3/3] Creating GitHub release..." -ForegroundColor Yellow

# 1. Сначала создаем пустой релиз (без файлов)
Write-Host "[RELEASE] Creating release v$version..." -ForegroundColor Cyan
gh release create "v$version" --title "AB Runner v$version" --generate-notes --latest
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to create release" -ForegroundColor Red
    exit 1
}

# 2. Загружаем файлы по одному (надежнее для больших .exe)
Write-Host "[UPLOAD] Uploading .exe ($sizeMB MB)..." -ForegroundColor Cyan
gh release upload "v$version" "$($exeFile.FullName)" --clobber
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] .exe upload failed, try manually:" -ForegroundColor Yellow
}

if ($blockmapFile) {
    Write-Host "[UPLOAD] Uploading .blockmap..." -ForegroundColor Cyan
    gh release upload "v$version" "$($blockmapFile.FullName)" --clobber
}

# 3. Загружаем latest.yml (критично для автообновлений!)
$latestYml = Get-ChildItem -Path ".\dist" -Filter "latest.yml" -ErrorAction SilentlyContinue
if ($latestYml) {
    Write-Host "[UPLOAD] Uploading latest.yml (for auto-updates)..." -ForegroundColor Cyan
    gh release upload "v$version" "$($latestYml.FullName)" --clobber
}
else {
    Write-Host "[WARN] latest.yml not found! Auto-updates won't work." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[DONE] Release v$version published!" -ForegroundColor Green
Write-Host "       https://github.com/DIGSON-2/ab-runner/releases/tag/v$version" -ForegroundColor Cyan