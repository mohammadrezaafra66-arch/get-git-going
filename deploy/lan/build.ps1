# build.ps1
# Builds the LAN image and stamps the REAL git SHA into it.
# ASCII-only. Compatible with Windows PowerShell 5.1.
#
# WHY THIS EXISTS
#   The image records its commit through a build arg:
#     docker-compose.yml : GIT_SHA: ${GIT_SHA:-local-unknown}
#     Dockerfile         : ARG GIT_SHA=unknown  ->  ENV APP_GIT_SHA=$GIT_SHA
#   and /api/version serves APP_GIT_SHA so you can tell what is actually running.
#
#   That stamp has been unreliable for two separate reasons:
#     1. Building without --env-file leaves GIT_SHA unset, so it falls back to
#        the literal "local-unknown".
#     2. Worse, .env.lan contains a HARD-CODED GIT_SHA that was correct only on
#        the day it was written. So even a correct --env-file build stamps that
#        frozen value, and every image since has claimed the same old commit.
#
#   This script fixes both: it reads the real SHA from git and exports it, and
#   a shell variable takes precedence over the env file during interpolation, so
#   the stale value in .env.lan is overridden for this build.
#
#   If the working tree has uncommitted changes to tracked files, the stamp is
#   suffixed with "-dirty", because the commit alone would not describe what was
#   built. This matches how `git describe --dirty` behaves (untracked files are
#   ignored). /api/version tolerates the suffix - it slices the first 7 chars for
#   commitShort, which is still the SHA.
#
# THE CLEAN-TREE GUARD
#   docker-compose.yml builds the web image with "context: ../..", i.e. the whole
#   working tree - not the commit. So anything uncommitted, tracked or not, is
#   copied into the image and runs live, while APP_GIT_SHA reports the last
#   commit. That gap let requirement-219 work run on the server for months while
#   it was believed to be disabled.
#
#   The script therefore refuses to build a dirty tree. Use -Force when you
#   genuinely mean to ship uncommitted code; the image is then stamped "-dirty"
#   so at least the stamp does not lie.
#
# USAGE
#   .\deploy\lan\build.ps1              # build every service that has a build
#   .\deploy\lan\build.ps1 web          # build one service
#   .\deploy\lan\build.ps1 --no-cache   # extra args pass straight through
#   .\deploy\lan\build.ps1 -Force       # build anyway with a dirty tree
#
#   This script does NOT start anything. Run .\deploy\lan\up.ps1 afterwards.

param([switch]$Force)
#
# NOTE ON PROMOTING TO PRODUCTION
#   VITE_SUPABASE_URL is baked into the client bundle at build time from
#   .env.lan. An image built on the dev machine therefore points at the dev
#   backend and must NOT be reused on the production laptop - build there, with
#   that machine's own .env.lan.

$ErrorActionPreference = "Stop"

$envFile     = Join-Path $PSScriptRoot ".env.lan"
$composeFile = Join-Path $PSScriptRoot "docker-compose.yml"
$repoRoot    = Resolve-Path (Join-Path $PSScriptRoot "..\..")

# --- refuse to ship an uncommitted working tree -------------------------------
# Untracked files count. The build context is the whole tree, so an untracked
# file ends up in the image just as surely as a modified tracked one.
$dirty = (& git -C $repoRoot status --porcelain 2>$null)
if ($dirty -and -not $Force) {
    Write-Host "Working tree is not clean." -ForegroundColor Red
    & git -C $repoRoot status --short
    Write-Host ""
    Write-Host "docker-compose builds from the working tree, so these files would ship" -ForegroundColor Yellow
    Write-Host "to the server while APP_GIT_SHA still reports the last commit." -ForegroundColor Yellow
    Write-Host "Commit them first, or re-run with -Force to deploy anyway."
    exit 1
}

if (-not (Test-Path $composeFile)) {
    Write-Host "Compose file not found: $composeFile" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $envFile)) {
    Write-Host "Missing env file: $envFile" -ForegroundColor Red
    Write-Host "Without it the build args (VITE_SUPABASE_URL, keys) are empty and the" -ForegroundColor Yellow
    Write-Host "resulting image cannot reach any backend." -ForegroundColor Yellow
    Write-Host "Create it first:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\init-lan.ps1" -ForegroundColor Yellow
    exit 1
}

# --- resolve the real commit ---
$sha = (& git -C $repoRoot rev-parse --short HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($sha)) {
    Write-Host "Could not read the git SHA from $repoRoot." -ForegroundColor Red
    Write-Host "Is git installed and is this a git repository?" -ForegroundColor Yellow
    exit 1
}
$sha = $sha.Trim()

# Tracked-but-uncommitted changes mean the commit alone does not describe the build.
$dirty = (& git -C $repoRoot status --porcelain --untracked-files=no 2>$null)
if (-not [string]::IsNullOrWhiteSpace($dirty)) {
    $sha = "$sha-dirty"
    Write-Host ""
    Write-Host "WARNING: the working tree has uncommitted changes to tracked files." -ForegroundColor Yellow
    Write-Host "Stamping the image as '$sha' so it is clear this is not a clean commit." -ForegroundColor Yellow
    Write-Host "Commit first if you want a reproducible build." -ForegroundColor Yellow
}

$buildTime = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

Write-Host ""
Write-Host "Stamping image with:" -ForegroundColor Cyan
Write-Host "  GIT_SHA    = $sha" -ForegroundColor Cyan
Write-Host "  BUILD_TIME = $buildTime" -ForegroundColor Cyan
Write-Host "(these override the values in .env.lan for this build)" -ForegroundColor DarkGray

# Shell variables win over --env-file during Compose interpolation, which is how
# the stale GIT_SHA in .env.lan gets overridden. Restore whatever was there.
$prevSha  = $env:GIT_SHA
$prevTime = $env:BUILD_TIME
try {
    $env:GIT_SHA    = $sha
    $env:BUILD_TIME = $buildTime

    $shown = "docker compose --env-file `"$envFile`" -f `"$composeFile`" build"
    if ($args.Count -gt 0) { $shown = "$shown $($args -join ' ')" }
    Write-Host ""
    Write-Host $shown -ForegroundColor Cyan

    docker compose --env-file $envFile -f $composeFile build @args
    $code = $LASTEXITCODE
}
finally {
    $env:GIT_SHA    = $prevSha
    $env:BUILD_TIME = $prevTime
}

if ($code -ne 0) {
    Write-Host ""
    Write-Host "Build failed with exit code $code." -ForegroundColor Red
    exit $code
}

Write-Host ""
Write-Host "Build complete. The image is built but NOT running yet." -ForegroundColor Green
Write-Host "To roll it out:" -ForegroundColor Green
Write-Host "  .\deploy\lan\up.ps1" -ForegroundColor Green
Write-Host "Then confirm the stamp took effect:" -ForegroundColor Green
Write-Host "  curl http://192.168.170.8:3100/api/version" -ForegroundColor Green
