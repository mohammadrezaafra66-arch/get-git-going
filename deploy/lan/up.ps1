# up.ps1
# Brings the LAN stack up with the correct env file, every time.
# ASCII-only. Compatible with Windows PowerShell 5.1.
#
# WHY THIS EXISTS
#   deploy/lan/docker-compose.yml uses ${VAR} interpolation for everything
#   (APP_PORT, SUPABASE_URL, POSTGRES_PASSWORD, GIT_SHA, ...). Compose only
#   resolves those from the shell environment or from an explicit --env-file.
#   The file here is named .env.lan, NOT .env, so Compose does NOT pick it up
#   automatically.
#
#   Running the raw command without --env-file fails SILENTLY and badly:
#     - APP_PORT      -> falls back to 3000, so the app is not on :3100
#     - SUPABASE_URL  -> empty, so the app cannot reach its backend
#     - POSTGRES_*    -> empty, so db-role-fix exits 1
#     - and because auth/rest depend on db-role-fix completing successfully,
#       kong/auth/rest/storage/meta/web never start at all.
#   This has taken the stack down twice. Use this script instead of the raw
#   docker compose command.
#
# USAGE
#   .\deploy\lan\up.ps1              # start / update the stack
#   .\deploy\lan\up.ps1 --build      # extra args are passed straight through
#   .\deploy\lan\up.ps1 --build -Force   # build a dirty tree anyway
#
# NOTE: this script never edits .env.lan. It only reads it.
#
# THE CLEAN-TREE GUARD
#   This script normally only starts containers, which is safe with a dirty tree
#   and is exactly what you want mid-development. But "--build" makes Compose
#   rebuild from "context: ../..", i.e. the whole working tree, so uncommitted
#   code would ship live while APP_GIT_SHA still reports the last commit. The
#   guard therefore fires only when a build is actually being requested.

param([switch]$Force)

$ErrorActionPreference = "Stop"

$envFile     = Join-Path $PSScriptRoot ".env.lan"
$composeFile = Join-Path $PSScriptRoot "docker-compose.yml"
$repoRoot    = Resolve-Path (Join-Path $PSScriptRoot "..\..")

if (@($args) -contains "--build") {
    $dirty = (& git -C $repoRoot status --porcelain 2>$null)
    if ($dirty -and -not $Force) {
        Write-Host "Working tree is not clean." -ForegroundColor Red
        & git -C $repoRoot status --short
        Write-Host ""
        Write-Host "--build rebuilds from the working tree, so these files would ship to the" -ForegroundColor Yellow
        Write-Host "server while APP_GIT_SHA still reports the last commit." -ForegroundColor Yellow
        Write-Host "Commit them first, or re-run with -Force to deploy anyway."
        exit 1
    }
}

if (-not (Test-Path $composeFile)) {
    Write-Host "Compose file not found: $composeFile" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $envFile)) {
    Write-Host "Missing env file: $envFile" -ForegroundColor Red
    Write-Host "Without it the stack starts half-broken (empty SUPABASE_URL, wrong port, db-role-fix fails)." -ForegroundColor Yellow
    Write-Host "Create it first:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\init-lan.ps1" -ForegroundColor Yellow
    Write-Host "On this dev machine the host IP is 192.168.170.8 (NOT the production laptop)." -ForegroundColor Yellow
    exit 1
}

# Echo the exact command so it is obvious what ran.
$shown = "docker compose --env-file `"$envFile`" -f `"$composeFile`" up -d"
if ($args.Count -gt 0) { $shown = "$shown $($args -join ' ')" }
Write-Host $shown -ForegroundColor Cyan

docker compose --env-file $envFile -f $composeFile up -d @args
$code = $LASTEXITCODE

if ($code -ne 0) {
    Write-Host ""
    Write-Host "docker compose exited with code $code." -ForegroundColor Red
    Write-Host "Check db-role-fix first - if it exited non-zero, the other services will stay in 'Created':" -ForegroundColor Yellow
    Write-Host "  docker logs afrakala-lan-db-role-fix" -ForegroundColor Yellow
    exit $code
}

# --- publish this build's release notes to /updates ---------------------------
# WHY HERE AND NOT INSIDE THE CONTAINER
#   The runner image contains only .output, package.json and node_modules, and
#   its CMD is `node .output/server/index.mjs` (nitro's own server). server/ is
#   never copied in, so nothing in the container can run the publisher. The host
#   can: it has node, the repo, the generated notes, and reachability to the API.
#
#   APP_GIT_SHA is read back OUT of the running container rather than from git,
#   so what gets published always describes what is actually deployed - even if
#   the working tree has moved on, or `up` started an older image.
#
#   Failure here never fails the deploy. A missing row on /updates is
#   recoverable; a deploy reported as broken is not.
$deployedSha  = (docker inspect afrakala-lan-web --format '{{range .Config.Env}}{{println .}}{{end}}' 2>$null | Select-String '^APP_GIT_SHA=' | ForEach-Object { ($_ -split '=',2)[1] })
$deployedTime = (docker inspect afrakala-lan-web --format '{{range .Config.Env}}{{println .}}{{end}}' 2>$null | Select-String '^APP_BUILD_TIME=' | ForEach-Object { ($_ -split '=',2)[1] })

if ($deployedSha) {
    Write-Host ""
    Write-Host "Publishing release notes for $deployedSha ..." -ForegroundColor Cyan
    $prev = @{
        url  = $env:SUPABASE_URL
        key  = $env:SUPABASE_SERVICE_ROLE_KEY
        sha  = $env:APP_GIT_SHA
        time = $env:APP_BUILD_TIME
    }
    try {
        # Read the API URL and service key straight from the env file rather than
        # the container: the host must reach the published Kong port, not the
        # compose-internal hostname the container uses.
        $env:SUPABASE_URL = ((Select-String -Path $envFile -Pattern '^API_EXTERNAL_URL=' | Select-Object -First 1).Line -replace '^API_EXTERNAL_URL=','').Trim()
        $env:SUPABASE_SERVICE_ROLE_KEY = ((Select-String -Path $envFile -Pattern '^SERVICE_ROLE_KEY=' | Select-Object -First 1).Line -replace '^SERVICE_ROLE_KEY=','').Trim()
        $env:APP_GIT_SHA = $deployedSha.Trim()
        $env:APP_BUILD_TIME = if ($deployedTime) { $deployedTime.Trim() } else { $null }
        & node (Join-Path $repoRoot "server\publish-release.mjs")
    }
    catch {
        Write-Host "Release-note publish failed (deploy is unaffected): $_" -ForegroundColor Yellow
    }
    finally {
        $env:SUPABASE_URL = $prev.url
        $env:SUPABASE_SERVICE_ROLE_KEY = $prev.key
        $env:APP_GIT_SHA = $prev.sha
        $env:APP_BUILD_TIME = $prev.time
    }
}

Write-Host ""
Write-Host "Done. Current state:" -ForegroundColor Green
docker ps -a --filter "name=afrakala-lan" --format "{{.Names}}`t{{.Status}}`t{{.Ports}}"
Write-Host ""
Write-Host "Expected: db-role-fix 'Exited (0)', every other service 'Up'." -ForegroundColor Green
Write-Host "If any service shows 'Created', it never started - see db-role-fix logs." -ForegroundColor Yellow
