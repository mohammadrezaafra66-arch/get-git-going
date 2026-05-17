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
# Dry-run example:
#   $env:LAN_DB_HOST="127.0.0.1"; $env:LAN_DB_PORT="5432"
#   $env:LAN_DB_NAME="postgres";  $env:LAN_DB_USER="postgres"
#   $env:LAN_DB_PASSWORD="..."    # never commit this
#   .\import-products-staged.ps1 -StagingDir 'C:\afra\dumps\products-20260517-...'
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
  [string]$LanAdminUserId  = "4084224a-cd34-4632-9cbc-3b5f3581cf6e"
)

$ErrorActionPreference = "Stop"

function Require-Env($name) {
  $val = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($val)) { throw "[ERROR] env $name is required" }
  return $val
}

$DbHost = Require-Env "LAN_DB_HOST"
$DbPort = Require-Env "LAN_DB_PORT"
$DbName = Require-Env "LAN_DB_NAME"
$DbUser = Require-Env "LAN_DB_USER"
$DbPass = Require-Env "LAN_DB_PASSWORD"

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

# Transaction control is owned by this wrapper (-1 = single tx).
# A trailing COMMIT/ROLLBACK is appended after the script body via stdin so
# the entire run is a single psql session and one atomic transaction.
$EndStmt = if ($DryRun) { "ROLLBACK;" } else { "COMMIT;" }

$env:PGPASSWORD = $DbPass
$psqlArgs = @(
  "-h", $DbHost, "-p", $DbPort, "-U", $DbUser, "-d", $DbName,
  "-X", "-1",
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
Write-Host "Target  : $DbUser@${DbHost}:${DbPort}/${DbName}"
Write-Host "Staging : $StagingDir"
Write-Host "SqlFile : $SqlFile"
Write-Host "DryRun  : $DryRun  (terminator: $EndStmt)"
Write-Host ""

try {
  & psql @psqlArgs
  if ($LASTEXITCODE -ne 0) {
    throw "psql exited with code $LASTEXITCODE - transaction was rolled back by -1 / ON_ERROR_STOP."
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
