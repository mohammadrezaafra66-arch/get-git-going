# AfraKala - Phase 3 / Task AFRA-20260517-PRODUCTS-U02-S02 (Corrected)
# PowerShell wrapper for import-products-staged.sql on LAN.
#
# Responsibilities:
#   1) Verify required CSV files exist in -StagingDir.
#   2) Require an existing backup file before any real import.
#   3) Pass each CSV path as a separate psql -v variable (Windows-safe;
#      no path concatenation inside SQL).
#   4) Always run inside a transaction:
#        dry-run  -> issue ROLLBACK at the end (public.* untouched).
#        real run -> issue COMMIT on success, ROLLBACK on any error.
#   5) No secret is stored in the file. PGPASSWORD is read from env and
#      cleared in finally.
#
# Two execution modes:
#   A) Host psql  (default)  - requires psql on PATH and LAN_DB_* env vars.
#   B) Docker     (-UseDocker) - runs psql inside the LAN DB container;
#                                no host psql, no LAN_DB_* env vars needed.
#
# Dry-run example (host psql):
#   $env:LAN_DB_HOST="127.0.0.1"; $env:LAN_DB_PORT="5432"
#   $env:LAN_DB_NAME="postgres";  $env:LAN_DB_USER="postgres"
#   $env:LAN_DB_PASSWORD="..."    # never commit this
#   .\import-products-staged.ps1 -StagingDir 'C:\afra\dumps\products-20260517-...'
#
# Dry-run example (Docker mode, no host psql required):
#   .\import-products-staged.ps1 -StagingDir 'C:\afra\dumps\products-20260517-...' `
#                                -UseDocker -DbContainerName 'afrakala-lan-db'
#
# Real run (only after U01 approval and backup):
#   .\import-products-staged.ps1 -StagingDir '...' -DryRun:$false `
#                                -BackupFile 'C:\afra\backups\lan-YYYYMMDD.dump'

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$StagingDir,
  [bool]$DryRun = $true,
  [string]$BackupFile = "",
  [string]$LanCashPriceId  = "c70761f0-fcdc-4a7f-82a9-8c8cad00453d",
  [string]$LanAdminUserId  = "4084224a-cd34-4632-9cbc-3b5f3581cf6e",
  [switch]$UseDocker,
  [string]$DbContainerName = "afrakala-lan-db",
  [string]$DockerDbUser    = "postgres",
  [string]$DockerDbName    = "postgres",
  [string]$DockerStageDir  = "/tmp/afrakala-products-import"
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

$BrandsCsv     = (Join-Path $StagingDir "brands.csv")
$CategoriesCsv = (Join-Path $StagingDir "categories.csv")
$ProductsCsv   = (Join-Path $StagingDir "products.csv")
$PcpCsv        = (Join-Path $StagingDir "product_computed_prices.csv")

foreach ($p in @($BrandsCsv,$CategoriesCsv,$ProductsCsv,$PcpCsv)) {
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
$SqlFile = Join-Path $PSScriptRoot "..\..\migration\sql\import-products-staged.sql"
$SqlFile = (Resolve-Path $SqlFile).Path

$DryRunStr = if ($DryRun) { "true" } else { "false" }

# The SQL file opens its own BEGIN. Both -f and -c run in the SAME psql
# session, so the wrapper just appends COMMIT or ROLLBACK to terminate the
# transaction explicitly. Do NOT pass -1 here (it would conflict with the
# explicit BEGIN inside the SQL).
$EndStmt = if ($DryRun) { "ROLLBACK;" } else { "COMMIT;" }

if ($UseDocker) {
  # ---------------------------------------------------------------------
  # Mode B: Docker - run psql inside the LAN DB container.
  # No host psql required. No LAN_DB_* env vars required.
  # CSVs and SQL are copied into the container, then deleted in finally.
  # ---------------------------------------------------------------------
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) { throw "[ERROR] docker is not available on PATH." }

  $running = (& docker ps --filter "name=^/$DbContainerName$" --format "{{.Names}}") 2>$null
  if ($running -ne $DbContainerName) {
    throw "[ERROR] container '$DbContainerName' is not running. Start the LAN stack first."
  }

  $InBrands  = "$DockerStageDir/brands.csv"
  $InCats    = "$DockerStageDir/categories.csv"
  $InProds   = "$DockerStageDir/products.csv"
  $InPcp     = "$DockerStageDir/product_computed_prices.csv"
  $InSql     = "$DockerStageDir/import-products-staged.sql"

  Write-Host ""
  Write-Host "Mode    : Docker"
  Write-Host "Container: $DbContainerName"
  Write-Host "DB user/db: $DockerDbUser / $DockerDbName"
  Write-Host "Staging : $StagingDir  ->  ${DbContainerName}:$DockerStageDir"
  Write-Host "SqlFile : $SqlFile"
  Write-Host "DryRun  : $DryRun  (terminator: $EndStmt)"
  Write-Host ""

  try {
    # Prepare clean in-container staging dir.
    & docker exec $DbContainerName sh -c "rm -rf '$DockerStageDir' && mkdir -p '$DockerStageDir'"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] failed to create $DockerStageDir in container." }

    # Copy CSVs + SQL into the container.
    & docker cp $BrandsCsv     "${DbContainerName}:$InBrands"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] docker cp brands.csv failed." }
    & docker cp $CategoriesCsv "${DbContainerName}:$InCats"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] docker cp categories.csv failed." }
    & docker cp $ProductsCsv   "${DbContainerName}:$InProds"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] docker cp products.csv failed." }
    & docker cp $PcpCsv        "${DbContainerName}:$InPcp"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] docker cp product_computed_prices.csv failed." }
    & docker cp $SqlFile       "${DbContainerName}:$InSql"
    if ($LASTEXITCODE -ne 0) { throw "[ERROR] docker cp import-products-staged.sql failed." }

    # Run psql inside the container. Local Unix socket - no password needed.
    $dockerArgs = @(
      "exec", "-e", "PAGER=cat", $DbContainerName,
      "psql", "-P", "pager=off",
      "-U", $DockerDbUser, "-d", $DockerDbName,
      "-X",
      "-v", "ON_ERROR_STOP=1",
      "-v", "dry_run=$DryRunStr",
      "-v", "lan_cash_price_id=$LanCashPriceId",
      "-v", "lan_admin_user_id=$LanAdminUserId",
      "-v", "brands_csv=$InBrands",
      "-v", "categories_csv=$InCats",
      "-v", "products_csv=$InProds",
      "-v", "product_computed_prices_csv=$InPcp",
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
      Write-Host "  .\import-products-staged.ps1 -StagingDir '$StagingDir' -UseDocker -DbContainerName '$DbContainerName' -DryRun:`$false -BackupFile '<path-to-backup>'"
    } else {
      Write-Host ""
      Write-Host "[done] Import committed. Run UI verification scenarios next."
    }
  } finally {
    # Best-effort cleanup of staged files inside the container.
    & docker exec $DbContainerName sh -c "rm -rf '$DockerStageDir'" 2>$null | Out-Null
  }
}
else {
  # ---------------------------------------------------------------------
  # Mode A: Host psql (default). Requires psql on PATH + LAN_DB_* env vars.
  # ---------------------------------------------------------------------
  $env:PGPASSWORD = $DbPass
  $psqlArgs = @(
    "-h", $DbHost, "-p", $DbPort, "-U", $DbUser, "-d", $DbName,
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "-v", "dry_run=$DryRunStr",
    "-v", "lan_cash_price_id=$LanCashPriceId",
    "-v", "lan_admin_user_id=$LanAdminUserId",
    "-v", "brands_csv=$BrandsCsv",
    "-v", "categories_csv=$CategoriesCsv",
    "-v", "products_csv=$ProductsCsv",
    "-v", "product_computed_prices_csv=$PcpCsv",
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
      Write-Host "  .\import-products-staged.ps1 -StagingDir '$StagingDir' -DryRun:`$false -BackupFile '<path-to-backup>'"
    } else {
      Write-Host ""
      Write-Host "[done] Import committed. Run UI verification scenarios next."
    }
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}
