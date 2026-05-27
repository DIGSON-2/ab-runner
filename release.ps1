param(
    [ValidateSet("patch", "minor", "major")]
    [string]$BumpType = "patch"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Starting release ($BumpType) ===" -ForegroundColor Cyan

Write-Host "[1/5] Bumping version..." -ForegroundColor Yellow
npm version $BumpType --no-git-tag-version
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version

git add .
git commit -m "chore: release v$version"
git tag "v$version"
git push --follow-tags

Write-Host "[OK] Version: v$version, tag pushed" -ForegroundColor Green

Write-Host ""
Write-Host "[2/5] Building Windows app..." -ForegroundColor Yellow
npm run build:win

$exeFile = Get-ChildItem -Path ".\dist" -Filter "*.exe" |
    Where-Object { $_.Name -notmatch "blockmap" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $exeFile) {
    Write-Host "[ERROR] .exe not found in dist/" -ForegroundColor Red
    exit 1
}

$sizeMB = [math]::Round($exeFile.Length / 1MB, 2)
Write-Host "[OK] Built: $($exeFile.Name)" -ForegroundColor Green
Write-Host "     Size: $sizeMB MB" -ForegroundColor Gray

$hasGh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $hasGh) {
    Write-Host ""
    Write-Host "[WARN] GitHub CLI not installed!" -ForegroundColor Yellow
    Write-Host "       Install: winget install GitHub.cli" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[FILE] Ready for manual upload:" -ForegroundColor Cyan
    Write-Host "       $($exeFile.FullName)" -ForegroundColor White
    Write-Host ""
    Write-Host "       Upload at: https://github.com/DIGSON-2/ab-runner/releases" -ForegroundColor Gray
    exit 0
}

Write-Host ""
Write-Host "[3/5] Creating GitHub release..." -ForegroundColor Yellow
$releaseArgs = @("release", "create", "v$version", "--title", "AB Runner v$version", "--generate-notes", $exeFile.FullName)
& gh @releaseArgs

Write-Host ""
Write-Host "[DONE] Release v$version published!" -ForegroundColor Green
Write-Host "       https://github.com/DIGSON-2/ab-runner/releases/tag/v$version" -ForegroundColor Cyan
