# AfraKala - Phase 3/B2 / Task AFRA-20260517-PURCHASE-PRICES-U02-S02
# PowerShell wrapper for import-purchase-prices-staged.sql on LAN.
#
# Mirrors the design of import-products-staged.ps1:
#   - Default = dry-run (wrapper sends ROLLBACK, no public.* changes).
#   - Real run requires -DryRun:$false AND -BackupFile pointing to an
#     existing LAN backup file.
#   - Two modes: Host psql (default) and Docker (-UseDocker).
#   - In Docker mode the four \copy lines are patched to literal in-container
#     paths because psql variable interpolation inside backslash meta-commands
#     is unreliable across psql builds.
#
# All Cloud purchase_prices.registered_by values are remapped inside SQL to
# -LanAdminUserId (default = LAN admin "محمدرضا افرا"). Cloud UUIDs are
# preserved for suppliers, price_change_reasons, and purchase_prices.
#
# Dry-run (Docker, recommended for LAN):
#   .\import-purchase-prices-staged.ps1 -StagingDir 'C:\afra\dumps\pp-...' `
#                                       -UseDocker -DbContainerName 'afrakala-lan-db'
#
# Real run (only after U01 approval and a fresh backup):
#   .\import-purchase-prices-staged.ps1 -StagingDir 'C:\afra\dumps\pp-...' `
#                                       -UseDocker -DbContainerName 'afrakala-lan-db' `
#                                       -DryRun:$false `
#                                       -BackupFile 'C:\afra\backups\lan-YYYYMMDD.dump'

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$StagingDir,
  [bool]$DryRun = $true,
  [string]$BackupFile = "",
  [string]$LanAdminUserId = "4084224a-cd34-4632-9cbc-3b5f3581cf6e",
  [switch]$UseDocker,
  [string]$DbContainerName = "afrakala-lan-db",
  [string]$DockerDbUser    = "postgres",
  [string]$DockerDbName    = "postgres",
  [string]$DockerStageDir  = "/tmp/afrakala-pp-import"
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

# --- Pre-flight: resolve staging dir and required CSVs ---------------------
if (-not (Test-Path $StagingDir)) { throw "[ERROR] staging dir not found: $StagingDir" }
$StagingDir = (Resolve-Path $StagingDir).Path

$SuppliersCsv = (Join-Path $StagingDir "suppliers.csv")
$ReasonsCsv   = (Join-Path $StagingDir "price_change_reasons.csv")
$PpCsv        = (Join-Path $StagingDir "purchase_prices.csv")

foreach ($p in @($SuppliersCsv,$ReasonsCsv,$PpCsv)) {
  if (-not (Test-Path $p)) { throw "[ERROR] missing CSV: $p" }
}

# --- Pre-flight: backup is mandatory for real import -----------------------
if (-not $DryRun) {
  if ([string]::IsNullOrWhiteSpace($BackupFile) -or -not (Test-Path $BackupFile)) {
    throw "[ERROR] real import requires -BackupFile pointing to an existing LAN backup."
  }
  Write-Host "[ok] backup verified: $BackupFile"
}

# --- Build psql invocation -------------------------------------------------
$SqlFile = Join-Path $PSScriptRoot "..\..\migration\sql\import-purchase-prices-staged.sql"
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

  $InSuppliers = "$DockerStageDir/suppliers.csv"
  $InReasons   = "$DockerStageDir/price_change_reasons.csv"
  $InPp        = "$DockerStageDir/purchase_prices.csv"
  $InSql       = "$DockerStageDir/import-purchase-prices-staged.sql"

  Write-Host ""
  Write-Host "Mode      : Docker"
  Write-Host "Container : $DbContainerName"
  Write-Host "DB user/db: $DockerDbUser / $DockerDbName"
  Write-Host "Staging   : $StagingDir  ->  ${DbContainerName}:$DockerStageDir"
  Write-Host "SqlFile   : $SqlFile"
  Write-Host "DryRun    : $DryRun  (terminator: $EndStmt)"
  Write-Host ""

  $PatchedSqlHost = $null
  try {
    & docker exec $DbContainerName sh -c "rm -rf '$DockerStageDir' && mkdir -p '$DockerStageDir'"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] failed to create $DockerStageDir in container." }

    & docker cp $SuppliersCsv "${DbContainerName}:$InSuppliers"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] docker cp suppliers.csv failed." }
    & docker cp $ReasonsCsv   "${DbContainerName}:$InReasons"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] docker cp price_change_reasons.csv failed." }
    & docker cp $PpCsv        "${DbContainerName}:$InPp"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] docker cp purchase_prices.csv failed." }

    # Patch \copy lines with literal in-container paths (same workaround as
    # import-products-staged.ps1).
    $sqlText = Get-Content -Raw -LiteralPath $SqlFile
    $sqlText = $sqlText -replace [regex]::Escape(":'suppliers_csv'"),            ("'" + $InSuppliers + "'")
    $sqlText = $sqlText -replace [regex]::Escape(":'price_change_reasons_csv'"), ("'" + $InReasons   + "'")
    $sqlText = $sqlText -replace [regex]::Escape(":'purchase_prices_csv'"),      ("'" + $InPp        + "'")

    $PatchedSqlHost = Join-Path ([System.IO.Path]::GetTempPath()) ("afrakala-import-pp-docker-" + [Guid]::NewGuid().ToString("N") + ".sql")
    [System.IO.File]::WriteAllText($PatchedSqlHost, $sqlText, (New-Object System.Text.UTF8Encoding($false)))

    & docker cp $PatchedSqlHost "${DbContainerName}:$InSql"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] docker cp import-purchase-prices-staged.sql (patched) failed." }

    $dockerArgs = @(
      "exec", "-e", "PAGER=cat", $DbContainerName,
      "psql", "-P", "pager=off",
      "-U", $DockerDbUser, "-d", $DockerDbName,
      "-X",
      "-v", "ON_ERROR_STOP=1",
      "-v", "dry_run=$DryRunStr",
      "-v", "lan_admin_user_id=$LanAdminUserId",
      "-f", $InSql,
      "-c", $EndStmt
    )

    & docker @dockerArgs
    if ($LASTEXITCODE -ne 0) {
      throw "psql (in $DbContainerName) exited with code $LASTEXITCODE - ON_ERROR_STOP aborted the transaction; no COMMIT was issued."
    }

    if ($DryRun) {
      Write-Host ""
      Write-Host "[dry-run] No rows were inserted; the transaction was rolled back."
      Write-Host "  Next step (after U01 approval and a fresh backup):"
      Write-Host "  .\import-purchase-prices-staged.ps1 -StagingDir '$StagingDir' -UseDocker -DbContainerName '$DbContainerName' -DryRun:`$false -BackupFile '<path-to-backup>'"
    } else {
      Write-Host ""
      Write-Host "[done] Import committed. Run UI verification scenarios next."
    }
  } finally {
    & docker exec $DbContainerName sh -c "rm -rf '$DockerStageDir'" 2>$null | Out-Null
    if ($PatchedSqlHost -and (Test-Path $PatchedSqlHost)) {
      Remove-Item -LiteralPath $PatchedSqlHost -Force -ErrorAction SilentlyContinue
    }
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
    "-v", "lan_admin_user_id=$LanAdminUserId",
    "-v", "suppliers_csv=$SuppliersCsv",
    "-v", "price_change_reasons_csv=$ReasonsCsv",
    "-v", "purchase_prices_csv=$PpCsv",
    "-f", $SqlFile,
    "-c", $EndStmt
  )

  Write-Host ""
  Write-Host "Mode    : Host psql"
  Write-Host "Target  : $DbUser@${DbHost}:${DbPort}/${DbName}"
  Write-Host "Staging : $StagingDir"
  Write-Host "SqlFile : $SqlFile"
  Write-Host "DryRun  : $DryRun  (terminator: $EndStmt)"
  Write-Host ""

  try {
    & psql @psqlArgs
    if ($LASTEXITCODE -ne 0) {
      throw "psql exited with code $LASTEXITCODE - ON_ERROR_STOP aborted the transaction; no COMMIT was issued."
    }

    if ($DryRun) {
      Write-Host ""
      Write-Host "[dry-run] No rows were inserted; the transaction was rolled back."
      Write-Host "  Next step (after U01 approval and a fresh backup):"
      Write-Host "  .\import-purchase-prices-staged.ps1 -StagingDir '$StagingDir' -DryRun:`$false -BackupFile '<path-to-backup>'"
    } else {
      Write-Host ""
      Write-Host "[done] Import committed. Run UI verification scenarios next."
    }
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}