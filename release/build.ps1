# release/build.ps1
# Builds afrakala-app:lan from the current HEAD of `main`, tags it with the commit SHA, and saves
# it to a gzipped tarball for transfer. ASCII-only, PowerShell 5.1 compatible.
#
# WHY THIS WRAPS deploy/lan/build.ps1 INSTEAD OF DUPLICATING IT
#   deploy/lan/build.ps1 already has a proven dirty-tree guard, reads the real git SHA, sets
#   GIT_SHA/BUILD_TIME correctly (docs/research/convergence/R-4-transfer-line.md Task 1.4), and
#   restores the previous environment afterward. Reimplementing that here would drift from it the
#   first time either one changes -- exactly the failure mode CLAUDE.md warns about for the
#   `--no-deps` / GIT_SHA rules. This script adds only what the release line needs on top: refusing
#   a non-`main` HEAD, writing a manifest, and producing the transfer tarball.
#
# WHY REFUSE UNLESS HEAD == origin/main
#   The whole point of the release line is that what gets rehearsed, documented in RELEASE-<date>.md,
#   and eventually applied to production is the exact commit that was reviewed and merged --
#   never a feature branch, never a local commit main hasn't seen yet.
#
# USAGE
#   .\release\build.ps1 [-Tag <image-tag-override>]
#
# OUTPUTS
#   - image afrakala-app:lan, additionally tagged afrakala-app:<short-sha>
#   - release/out/build-<sha>.json      (manifest: sha, build time, image id, size)
#   - release/out/afrakala-app-<sha>.tar.gz   (docker save | gzip)
#
# THIS SCRIPT DOES NOT DEPLOY ANYTHING. It builds and saves an image; nothing more.

param(
    [string]$Tag = "afrakala-app:lan"
)

$ErrorActionPreference = "Stop"
$env:DISABLE_LOVABLE_MCP = "1"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outDir = Join-Path $PSScriptRoot "out"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# --- refuse anything but a clean checkout of main, at origin's tip ---------------------------
$branch = (& git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null).Trim()
if ($branch -ne "main") {
    Write-Host "REFUSED: current branch is '$branch', not 'main'." -ForegroundColor Red
    Write-Host "A release image is built only from main -- checkout main first." -ForegroundColor Yellow
    exit 1
}

$dirty = (& git -C $repoRoot status --porcelain 2>$null)
if ($dirty) {
    Write-Host "REFUSED: working tree is not clean." -ForegroundColor Red
    & git -C $repoRoot status --short
    exit 1
}

& git -C $repoRoot fetch origin main 2>$null | Out-Null
$headSha = (& git -C $repoRoot rev-parse HEAD 2>$null).Trim()
$originSha = (& git -C $repoRoot rev-parse origin/main 2>$null).Trim()
if ($headSha -ne $originSha) {
    Write-Host "REFUSED: HEAD ($headSha) does not match origin/main ($originSha)." -ForegroundColor Red
    Write-Host "Pull or push first -- a release must build exactly what main has, no more, no less." -ForegroundColor Yellow
    exit 1
}

$shortSha = (& git -C $repoRoot rev-parse --short HEAD 2>$null).Trim()

Write-Host "Building $Tag from main @ $shortSha ..." -ForegroundColor Cyan

# --- D7: declare the undeclared prerequisite --------------------------------------------------
# deploy/lan/build.ps1 builds with `docker compose --env-file deploy/lan/.env.lan`. That file is
# gitignored, so a fresh clone does not have it. Without this check the release line would run,
# compose would interpolate every ${...} to empty, and the build would SUCCEED while producing an
# image whose runtime config is blank -- a wrong image rather than a failed run. Fail here instead.
$envFile = Join-Path $repoRoot "deploy\lan\.env.lan"
if (-not (Test-Path $envFile)) {
    Write-Host "REFUSED: required env file not found: $envFile" -ForegroundColor Red
    Write-Host "It is gitignored on purpose and is per-host, so a fresh clone never has it." -ForegroundColor Yellow
    Write-Host "Create it before building a release:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\init-lan.ps1" -ForegroundColor Yellow
    exit 1
}

# --- delegate the actual build to the proven script -------------------------------------------
$existingBuild = Join-Path $repoRoot "deploy\lan\build.ps1"
if (-not (Test-Path $existingBuild)) {
    Write-Host "Expected deploy\lan\build.ps1 not found at $existingBuild" -ForegroundColor Red
    exit 1
}
& $existingBuild
$buildCode = $LASTEXITCODE
if ($buildCode -ne 0) {
    Write-Host "Underlying build failed (exit $buildCode)." -ForegroundColor Red
    exit $buildCode
}

if ($Tag -ne "afrakala-app:lan") {
    docker tag afrakala-app:lan $Tag
}
docker tag afrakala-app:lan "afrakala-app:$shortSha"

$buildTime = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$imageId = (docker images afrakala-app:lan --format "{{.ID}}").Trim()
$imageSize = (docker images afrakala-app:lan --format "{{.Size}}").Trim()

$manifest = [ordered]@{
    git_sha    = $shortSha
    build_time = $buildTime
    image_tag  = $Tag
    image_id   = $imageId
    image_size = $imageSize
}
$manifestPath = Join-Path $outDir "build-$shortSha.json"
$manifest | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding ascii
Write-Host "Manifest written: $manifestPath" -ForegroundColor Green

# --- save + gzip for transfer -------------------------------------------------------------------
$tarPath = Join-Path $outDir "afrakala-app-$shortSha.tar.gz"
# D4: save the SHA tag, not $Tag (which defaults to afrakala-app:lan).
# The emitted runbook does `docker tag afrakala-app:<sha> afrakala-app:lan` after loading, and
# `docker load` only recreates the tags that were inside the archive. Saving :lan therefore
# produced an archive in which afrakala-app:<sha> does not exist, so that runbook line failed on a
# tag that was never there. Saving the sha tag makes the archive self-describing and leaves the
# runbook line correct. :lan is still applied on the target, by the runbook, after the load.
$saveTag = "afrakala-app:$shortSha"
Write-Host "docker save $saveTag | gzip -6 > $tarPath" -ForegroundColor Cyan
# See release/rehearse.ps1 for why Git Bash must be located explicitly (WSL's bash.exe on PATH
# cannot see Windows drive-letter paths the way this script needs).
$gitBashCandidates = @("C:\Program Files\Git\bin\bash.exe", "C:\Program Files\Git\usr\bin\bash.exe")
$bashPath = $gitBashCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bashPath) {
    $cmd = Get-Command "bash.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $bashPath = $cmd.Source }
}
if (-not $bashPath) {
    Write-Host "Git Bash not found; cannot pipe docker save through gzip. Manifest was still written." -ForegroundColor Yellow
    exit 0
}
$tarPathUnix = $tarPath.Replace('\', '/')
& $bashPath -c "docker save '$saveTag' | gzip -6 > '$tarPathUnix'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker save | gzip failed (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

$sizeBytes = (Get-Item $tarPath).Length
$sha256 = (Get-FileHash -Algorithm SHA256 -Path $tarPath).Hash.ToLower()
Write-Host ""
Write-Host "Tarball : $tarPath" -ForegroundColor Green
Write-Host "Size    : $sizeBytes bytes" -ForegroundColor Green
Write-Host "SHA256  : $sha256" -ForegroundColor Green

exit 0
