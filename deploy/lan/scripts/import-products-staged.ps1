# AfraKala — Phase 3 / Task AFRA-20260517-PRODUCTS-U02-S02
# Wrapper PowerShell برای اجرای import-products-staged.sql روی LAN.
#
# نقش این اسکریپت:
#   1) چک backup قبل از import (اجباری).
#   2) اجرای فایل SQL با DRY_RUN=true به‌صورت پیش‌فرض.
#   3) در حالت واقعی: BEGIN/COMMIT دستی، در صورت خطا ROLLBACK.
#   4) هیچ secret داخل فایل ذخیره نمی‌شود؛ از env یا prompt گرفته می‌شود.
#
# نمونه اجرا (dry-run):
#   $env:LAN_DB_HOST="127.0.0.1"; $env:LAN_DB_PORT="5432"
#   $env:LAN_DB_NAME="postgres"; $env:LAN_DB_USER="postgres"
#   $env:LAN_DB_PASSWORD="..."  # خارج از ریپو
#   .\import-products-staged.ps1 -StagingDir 'C:\afra\dumps\products-20260517-...'
#
# اجرای واقعی پس از تأیید U01:
#   .\import-products-staged.ps1 -StagingDir '...' -DryRun:$false -BackupFile 'C:\afra\backups\lan-YYYYMMDD.dump'

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

# ── Pre-flight: CSV files exist ─────────────────────────────────────────────
$required = @("brands.csv","categories.csv","products.csv","product_computed_prices.csv")
foreach ($f in $required) {
  $p = Join-Path $StagingDir $f
  if (-not (Test-Path $p)) { throw "[ERROR] missing CSV: $p" }
}

# ── Pre-flight: backup قبل از real import اجباری ────────────────────────────
if (-not $DryRun) {
  if ([string]::IsNullOrWhiteSpace($BackupFile) -or -not (Test-Path $BackupFile)) {
    throw "[ERROR] real import requires -BackupFile pointing to an existing LAN backup."
  }
  Write-Host "[ok] backup verified: $BackupFile"
}

# ── psql variables ─────────────────────────────────────────────────────────
$SqlFile = Join-Path $PSScriptRoot "..\..\migration\sql\import-products-staged.sql"
$SqlFile = (Resolve-Path $SqlFile).Path

$env:PGPASSWORD = $DbPass
$psqlArgs = @(
  "-h", $DbHost, "-p", $DbPort, "-U", $DbUser, "-d", $DbName,
  "-v", "ON_ERROR_STOP=1",
  "-v", "staging_dir=$StagingDir",
  "-v", "lan_cash_price_id=$LanCashPriceId",
  "-v", "lan_admin_user_id=$LanAdminUserId",
  "-v", "dry_run=$($DryRun.ToString().ToLower())",
  "-f", $SqlFile
)

Write-Host ""
Write-Host "Target  : $DbUser@${DbHost}:${DbPort}/${DbName}"
Write-Host "Staging : $StagingDir"
Write-Host "SqlFile : $SqlFile"
Write-Host "DryRun  : $DryRun"
Write-Host ""

try {
  & psql @psqlArgs
  if ($LASTEXITCODE -ne 0) { throw "psql exited with code $LASTEXITCODE" }

  if ($DryRun) {
    Write-Host ""
    Write-Host "[dry-run] هیچ ردیفی درج نشد. برای اجرای واقعی پس از تأیید U01:"
    Write-Host "  .\import-products-staged.ps1 -StagingDir '$StagingDir' -DryRun:`$false -BackupFile '<path-to-backup>'"
  } else {
    Write-Host ""
    Write-Host "[done] import کامل شد. لطفاً سناریوهای verification UI را اجرا کنید."
  }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}