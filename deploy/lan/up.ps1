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
#
# NOTE: this script never edits .env.lan. It only reads it.

$ErrorActionPreference = "Stop"

$envFile     = Join-Path $PSScriptRoot ".env.lan"
$composeFile = Join-Path $PSScriptRoot "docker-compose.yml"

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

Write-Host ""
Write-Host "Done. Current state:" -ForegroundColor Green
docker ps -a --filter "name=afrakala-lan" --format "{{.Names}}`t{{.Status}}`t{{.Ports}}"
Write-Host ""
Write-Host "Expected: db-role-fix 'Exited (0)', every other service 'Up'." -ForegroundColor Green
Write-Host "If any service shows 'Created', it never started - see db-role-fix logs." -ForegroundColor Yellow
