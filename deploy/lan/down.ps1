# down.ps1
# Stops the LAN stack with the correct env file.
# ASCII-only. Compatible with Windows PowerShell 5.1.
#
# WHY THIS EXISTS
#   Same reason as up.ps1: docker-compose.yml is full of ${VAR} interpolation
#   and the env file is named .env.lan, so Compose will not load it on its own.
#   Without --env-file, Compose warns about unset variables and can resolve a
#   different project shape than the one that is actually running.
#
# DATA SAFETY
#   This runs a plain `down`, which stops and removes containers but KEEPS the
#   named volumes - so the Postgres data survives. Passing -v / --volumes would
#   DELETE the database volume; that is guarded behind an explicit confirmation
#   below because it is irreversible.
#
# USAGE
#   .\deploy\lan\down.ps1            # stop the stack, keep data
#   .\deploy\lan\down.ps1 -v         # ALSO delete volumes - asks to confirm

$ErrorActionPreference = "Stop"

$envFile     = Join-Path $PSScriptRoot ".env.lan"
$composeFile = Join-Path $PSScriptRoot "docker-compose.yml"

if (-not (Test-Path $composeFile)) {
    Write-Host "Compose file not found: $composeFile" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $envFile)) {
    Write-Host "Missing env file: $envFile" -ForegroundColor Red
    Write-Host "Create it from deploy/lan/.env.lan.example before running compose commands." -ForegroundColor Yellow
    exit 1
}

# Guard the irreversible case: removing volumes destroys the Postgres data.
$wantsVolumes = @($args | Where-Object { $_ -eq "-v" -or $_ -eq "--volumes" }).Count -gt 0
if ($wantsVolumes) {
    Write-Host ""
    Write-Host "WARNING: -v / --volumes will DELETE the LAN Postgres volume." -ForegroundColor Red
    Write-Host "All data in the 'afrakala' database on this machine would be lost, including" -ForegroundColor Red
    Write-Host "every migration that has been applied. This cannot be undone." -ForegroundColor Red
    $confirm = Read-Host "Type EXACTLY 'DELETE-LAN-DATA' to continue, or anything else to abort"
    if ($confirm -ne "DELETE-LAN-DATA") {
        Write-Host "Aborted. Nothing was changed." -ForegroundColor Green
        exit 1
    }
}

$shown = "docker compose --env-file `"$envFile`" -f `"$composeFile`" down"
if ($args.Count -gt 0) { $shown = "$shown $($args -join ' ')" }
Write-Host $shown -ForegroundColor Cyan

docker compose --env-file $envFile -f $composeFile down @args
exit $LASTEXITCODE
