# AfraKala - Phase 3/B3 / Task AFRA-20260517-PRICING-RELINK-U02-S02
# PowerShell wrapper for relink-product-computed-prices-purchase-price.sql on LAN.
#
# Mirrors the dry-run / real-run discipline of import-purchase-prices-staged.ps1:
#   - Default = dry-run (wrapper appends ROLLBACK).
#   - Real run requires -DryRun:$false AND -BackupFile pointing to an
#     existing LAN backup file (.dump or .sql).
#   - Two modes: Host psql (default) and Docker (-UseDocker). Windows LAN
#     host has no psql, so Docker mode is the supported path.
#
# This script ONLY updates public.product_computed_prices.purchase_price_id
# for rows where it is currently NULL. It never overwrites an existing link,
# never inserts/deletes pcp rows, and never touches sale_price_types,
# pricing_rules, purchase_prices, auth.*, or any RBAC/RLS object.
#
# Dry-run (Docker, recommended):
#   .\relink-product-computed-prices-purchase-price.ps1 `
#       -UseDocker -DbContainerName 'afrakala-lan-db'
#
# Real run (only after U01 approval and a fresh LAN backup):
#   .\relink-product-computed-prices-purchase-price.ps1 `
#       -UseDocker -DbContainerName 'afrakala-lan-db' `
#       -DryRun:$false `
#       -BackupFile 'C:\afra\backups\lan-YYYYMMDD.dump'

[CmdletBinding()]
param(
  [bool]$DryRun = $true,
  [string]$BackupFile = "",
  [switch]$UseDocker,
  [string]$DbContainerName = "afrakala-lan-db",
  [string]$DockerDbUser    = "postgres",
  [string]$DockerDbName    = "postgres",
  [string]$DockerStageDir  = "/tmp/afrakala-pcp-relink"
)

$ErrorActionPreference = "Stop"

function Require-Env($name) {
  $val = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($val)) { throw "[ERROR] env $name is required" }
  return $val
}

if (-not $UseDocker) {
  $DbHost = Require-Env "LAN_DB_HOST"
  $DbPort = Require-Env "LAN_DB_PORT"
  $DbName = Require-Env "LAN_DB_NAME"
  $DbUser = Require-Env "LAN_DB_USER"
  $DbPass = Require-Env "LAN_DB_PASSWORD"
}

# --- Pre-flight: real-run requires a verified backup file ------------------
if (-not $DryRun) {
  if ([string]::IsNullOrWhiteSpace($BackupFile) -or -not (Test-Path $BackupFile)) {
    throw "[ERROR] real relink requires -BackupFile pointing to an existing LAN backup."
  }
  Write-Host "[ok] backup verified: $BackupFile"
}

# --- Resolve SQL file ------------------------------------------------------
$SqlFile = Join-Path $PSScriptRoot "..\..\migration\sql\relink-product-computed-prices-purchase-price.sql"
$SqlFile = (Resolve-Path $SqlFile).Path

$DryRunStr = if ($DryRun) { "true" } else { "false" }
$EndStmt   = if ($DryRun) { "ROLLBACK;" } else { "COMMIT;" }

if ($UseDocker) {
  # ---------------------------------------------------------------------
  # Mode B: Docker
  # ---------------------------------------------------------------------
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) { throw "[ERROR] docker is not available on PATH." }

  $running = (& docker ps --filter "name=^/$DbContainerName$" --format "{{.Names}}") 2>$null
  if ($running -ne $DbContainerName) {
    throw "[ERROR] container '$DbContainerName' is not running. Start the LAN stack first."
  }

  $InSql = "$DockerStageDir/relink-product-computed-prices-purchase-price.sql"

  Write-Host ""
  Write-Host "Mode      : Docker"
  Write-Host "Container : $DbContainerName"
  Write-Host "DB user/db: $DockerDbUser / $DockerDbName"
  Write-Host "SqlFile   : $SqlFile  ->  ${DbContainerName}:$InSql"
  Write-Host "DryRun    : $DryRun  (terminator: $EndStmt)"
  Write-Host ""

  try {
    & docker exec $DbContainerName sh -c "rm -rf '$DockerStageDir' && mkdir -p '$DockerStageDir'"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] failed to create $DockerStageDir in container." }

    & docker cp $SqlFile "${DbContainerName}:$InSql"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] docker cp relink SQL failed." }

    $dockerArgs = @(
      "exec", "-e", "PAGER=cat", $DbContainerName,
      "psql", "-P", "pager=off",
      "-U", $DockerDbUser, "-d", $DockerDbName,
      "-X",
      "-v", "ON_ERROR_STOP=1",
      "-v", "dry_run=$DryRunStr",
      "-f", $InSql,
      "-c", $EndStmt
    )

    & docker @dockerArgs
    if ($LASTEXITCODE -ne 0) {
      throw "psql (in $DbContainerName) exited with code $LASTEXITCODE - ON_ERROR_STOP aborted; no COMMIT was issued."
    }

    if ($DryRun) {
      Write-Host ""
      Write-Host "[dry-run] No rows were updated; the transaction was rolled back."
      Write-Host "  Next step (after U01 approval and a fresh backup):"
      Write-Host "  .\relink-product-computed-prices-purchase-price.ps1 -UseDocker -DbContainerName '$DbContainerName' -DryRun:`$false -BackupFile '<path-to-backup>'"
    } else {
      Write-Host ""
      Write-Host "[done] Relink committed. Run verification queries (see SQL section 5)."
    }
  } finally {
    & docker exec $DbContainerName sh -c "rm -rf '$DockerStageDir'" 2>$null | Out-Null
  }
}
else {
  # ---------------------------------------------------------------------
  # Mode A: Host psql
  # ---------------------------------------------------------------------
  $env:PGPASSWORD = $DbPass
  $psqlArgs = @(
    "-h", $DbHost, "-p", $DbPort, "-U", $DbUser, "-d", $DbName,
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "-v", "dry_run=$DryRunStr",
    "-f", $SqlFile,
    "-c", $EndStmt
  )

  Write-Host ""
  Write-Host "Mode    : Host psql"
  Write-Host "Target  : $DbUser@${DbHost}:${DbPort}/${DbName}"
  Write-Host "SqlFile : $SqlFile"
  Write-Host "DryRun  : $DryRun  (terminator: $EndStmt)"
  Write-Host ""

  try {
    & psql @psqlArgs
    if ($LASTEXITCODE -ne 0) {
      throw "psql exited with code $LASTEXITCODE - ON_ERROR_STOP aborted; no COMMIT was issued."
    }

    if ($DryRun) {
      Write-Host ""
      Write-Host "[dry-run] No rows were updated; the transaction was rolled back."
      Write-Host "  Next step (after U01 approval and a fresh backup):"
      Write-Host "  .\relink-product-computed-prices-purchase-price.ps1 -DryRun:`$false -BackupFile '<path-to-backup>'"
    } else {
      Write-Host ""
      Write-Host "[done] Relink committed. Run verification queries (see SQL section 5)."
    }
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}