#Requires -Version 5.1
<#
.SYNOPSIS
  Apply purchase_prices single-active fix (migration 560) on PRODUCTION (:3000).

.DESCRIPTION
  Fixes sale-price collapse after workbench save when multiple is_active purchase
  rows exist and the pricing queue recomputes from a stale base.

  On C:\afrakala (production laptop):
  - pull ExpectedBranch (default staging)
  - apply 20260922160000_560_purchase_prices_single_active.sql to DB postgres
  - record schema_migrations ledger
  - rebuild web --no-deps with GIT_SHA / BUILD_TIME
  - verify multi-active count = 0 and APP_GIT_SHA

  Never: docker compose down -v

.EXAMPLE
  cd C:\afrakala
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\prod-fix-purchase-single-active.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = "C:\afrakala",
  [int]$AppPort = 3000,
  [string]$ExpectedBranch = "staging",
  [string]$DbName = "postgres",
  [string]$DbContainer = "afrakala-lan-db",
  [string]$MigrationVersion = "20260922160000",
  [string]$MigrationFile = "supabase\migrations\20260922160000_560_purchase_prices_single_active.sql"
)

$ErrorActionPreference = "Stop"

function Fail([string]$Msg) {
  Write-Host "FAIL: $Msg" -ForegroundColor Red
  throw $Msg
}

function Log([string]$Msg) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format o), $Msg)
}

Write-Host "===== AFRAKALA_PROD_PURCHASE_SINGLE_ACTIVE_BEGIN ====="
Log ("RepoRoot=" + $RepoRoot)

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  Fail ("Missing " + $RepoRoot)
}
Set-Location -LiteralPath $RepoRoot

$EnvFile = Join-Path $RepoRoot "deploy\lan\.env.lan"
$Compose = Join-Path $RepoRoot "deploy\lan\docker-compose.yml"
$MigPath = Join-Path $RepoRoot $MigrationFile
if (-not (Test-Path -LiteralPath $EnvFile)) { Fail ("Missing " + $EnvFile) }
if (-not (Test-Path -LiteralPath $Compose)) { Fail ("Missing " + $Compose) }
if (-not (Test-Path -LiteralPath $MigPath)) { Fail ("Missing " + $MigPath) }

$pw = (Select-String -Path $EnvFile -Pattern '^POSTGRES_PASSWORD=(.+)$').Matches.Groups[1].Value
if ([string]::IsNullOrWhiteSpace($pw)) { Fail "POSTGRES_PASSWORD missing in .env.lan" }

# --- git ---
Log "STEP verify git"
git fetch origin 2>&1 | Out-Host
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$head = (git rev-parse --short HEAD).Trim()
Log ("BRANCH=" + $branch)
Log ("HEAD=" + $head)
if ($branch -ne $ExpectedBranch) {
  Log ("Checking out " + $ExpectedBranch)
  git checkout $ExpectedBranch 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail ("git checkout " + $ExpectedBranch + " failed") }
  git pull origin $ExpectedBranch 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "git pull failed" }
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  $head = (git rev-parse --short HEAD).Trim()
} else {
  git pull origin $ExpectedBranch 2>&1 | Out-Host
  $head = (git rev-parse --short HEAD).Trim()
}
if ($branch -ne $ExpectedBranch) { Fail ("Expected branch " + $ExpectedBranch + " got " + $branch) }
if (-not (Test-Path -LiteralPath $MigPath)) { Fail ("Missing migration after pull: " + $MigPath) }
Log "GIT_OK"

# --- docker ---
Log "STEP docker precheck"
$dv = docker version --format "{{.Server.Version}}" 2>&1
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace("$dv") -or ("$dv" -match "ERROR|500")) {
  Fail ("Docker Server not healthy: " + $dv)
}
$dbUp = docker ps --filter ("name=" + $DbContainer) --format "{{.Status}}"
if ($dbUp -notmatch "Up") { Fail ("DB container not Up: " + $dbUp) }
Log ("DOCKER_OK db=" + $dbUp)

# --- migration (skip if ledger already has version) ---
Log "STEP migration 560"
$have = docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -t -A -c ("SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '" + $MigrationVersion + "';")
$have = ("$have").Trim()
if ($have -eq "1") {
  Log ("LEDGER_ALREADY_HAS " + $MigrationVersion + " - skip apply, still verify")
} else {
  Log "Applying migration via stdin"
  # Byte-safe: avoid PowerShell pipeline encoding damage on Persian comments
  $bytes = [System.IO.File]::ReadAllBytes($MigPath)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "docker"
  $psi.Arguments = "exec -i -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 --single-transaction"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $p.StandardInput.Close()
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($stdout) { Write-Host $stdout }
  if ($stderr) { Write-Host $stderr }
  if ($p.ExitCode -ne 0) { Fail ("psql migration failed exit=" + $p.ExitCode) }

  docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -c ("INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('" + $MigrationVersion + "') ON CONFLICT (version) DO NOTHING;")
  if ($LASTEXITCODE -ne 0) { Fail "ledger insert failed" }
  Log "MIGRATION_APPLIED_AND_RECORDED"
}

$multi = docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -t -A -c "SELECT count(*) FROM (SELECT product_id FROM purchase_prices WHERE is_active GROUP BY product_id HAVING count(*) > 1) x;"
$multi = ("$multi").Trim()
Log ("MULTI_ACTIVE_PRODUCTS=" + $multi)
if ($multi -ne "0") { Fail ("multi-active products still present: " + $multi) }

$idx = docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -t -A -c "SELECT 1 FROM pg_indexes WHERE indexname='uq_purchase_prices_one_active_per_product';"
if (("$idx").Trim() -ne "1") { Fail "unique index missing" }
$trg = docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -t -A -c "SELECT 1 FROM pg_trigger WHERE tgname='trg_purchase_prices_single_active' AND NOT tgisinternal;"
if (("$trg").Trim() -ne "1") { Fail "single-active trigger missing" }
Log "DB_INVARIANT_OK"

# --- rebuild web ---
Log "STEP rebuild web"
$env:GIT_SHA = $head
$env:BUILD_TIME = (Get-Date -Format o)
Log ("BUILDING GIT_SHA=" + $env:GIT_SHA)
docker compose --env-file $EnvFile -f $Compose up -d --no-deps --build web
if ($LASTEXITCODE -ne 0) { Fail "web build/up failed" }

$healthy = $false
for ($i = 1; $i -le 48; $i++) {
  Start-Sleep -Seconds 5
  $st = docker ps --filter name=afrakala-lan-web --format "{{.Status}}"
  Log ("web try " + $i + " : " + $st)
  if ($st -match "healthy") { $healthy = $true; break }
}
if (-not $healthy) { Fail "web not healthy in time" }

$appSha = (docker compose --env-file $EnvFile -f $Compose exec -T web printenv APP_GIT_SHA).Trim()
Log ("APP_GIT_SHA=" + $appSha)
Start-Sleep -Seconds 3
$ver = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $AppPort + "/api/version") -TimeoutSec 30
Log ("VERSION_COMMIT=" + $ver.commit)

if ($appSha -ne $head) {
  Fail ("APP_GIT_SHA " + $appSha + " != HEAD " + $head)
}
$verOk = ($ver.commit -eq $head) -or (("$($ver.commit)") -like ($head + "*"))
if (-not $verOk) {
  Fail ("api/version commit " + $ver.commit + " != HEAD " + $head)
}

foreach ($p in @("/pricing/my-workbench", "/pricing/purchase-prices", "/login")) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ("http://127.0.0.1:" + $AppPort + $p) -MaximumRedirection 0
    Log ("SMOKE " + $p + " -> " + $r.StatusCode)
  } catch {
    if ($_.Exception.Response) {
      Log ("SMOKE " + $p + " -> " + [int]$_.Exception.Response.StatusCode)
    } else {
      Fail ("SMOKE " + $p + " FAIL " + $_.Exception.Message)
    }
  }
}

Write-Host "===== AFRAKALA_PROD_PURCHASE_SINGLE_ACTIVE_END ====="
Write-Host ("CUTOVER_OK HEAD=" + $head + " APP_GIT_SHA=" + $appSha + " MULTI_ACTIVE=0 WEB=healthy")
Write-Host "Manual: Ctrl+F5 on :3000 /pricing/my-workbench - change one purchase price, wait ~30s, sale must not drop to an old base."
