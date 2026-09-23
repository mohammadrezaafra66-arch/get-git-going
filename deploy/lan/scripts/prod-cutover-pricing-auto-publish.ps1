# prod-cutover-pricing-auto-publish.ps1
# Run ON the production laptop (192.168.170.10), as Administrator, from the LIVE clone root
# (C:\afrakala OR C:\AfraKalaServer\get-git-going01lan — whichever autostarts).
#
# Does:
#   1) git fetch + checkout main + pull
#   2) ensure PRICING_WORKER_TOKEN in deploy/lan/.env.lan (generate if missing)
#   3) apply migration 20260916170000 on DB postgres (skip if already in ledger)
#   4) rebuild web with --no-deps
#   5) register AfraKala-PricingWorker-Live (windowless)
#
# NEVER run docker compose down -v.
# ASCII-only. PowerShell 5.1 compatible.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\prod-cutover-pricing-auto-publish.ps1
#   powershell -ExecutionPolicy Bypass -File ...\prod-cutover-pricing-auto-publish.ps1 -ForceTest

param(
  [switch]$ForceTest
)

$ErrorActionPreference = "Stop"

function Get-EnvValue([string]$path, [string]$key) {
  $line = Select-String -Path $path -Pattern ("^\s*{0}=(.*)$" -f [regex]::Escape($key)) |
    Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Matches.Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Set-EnvValue([string]$path, [string]$key, [string]$value) {
  $raw = [System.IO.File]::ReadAllText($path)
  if ($raw -match ("(?m)^\s*{0}=.*$" -f [regex]::Escape($key))) {
    $raw = [regex]::Replace($raw, ("(?m)^\s*{0}=.*$" -f [regex]::Escape($key)), ("{0}={1}" -f $key, $value))
  } else {
    if (-not $raw.EndsWith("`n") -and -not $raw.EndsWith("`r`n")) { $raw += "`r`n" }
    $raw += ("`r`n# PRICE-RT worker token (server-only)`r`n{0}={1}`r`n" -f $key, $value)
  }
  [System.IO.File]::WriteAllText($path, $raw)
}

# --- locate repo root (script lives in deploy/lan/scripts) ---
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lanDir = Resolve-Path (Join-Path $scriptDir "..")
$repoRoot = Resolve-Path (Join-Path $lanDir "..\..")
Set-Location $repoRoot

Write-Host ("REPO={0}" -f $repoRoot) -ForegroundColor Cyan
Write-Host ("HOST={0}" -f $env:COMPUTERNAME)

# Safety: refuse if this looks like the test box unless -ForceTest
$ipv4 = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -like "192.168.170.*" } |
  Select-Object -ExpandProperty IPAddress)
if (($ipv4 -contains "192.168.170.8") -and -not $ForceTest) {
  throw "This host looks like the TEST box (192.168.170.8). Run on production (192.168.170.10), or pass -ForceTest."
}

# --- 1) git pull main ---
Write-Host "`n=== 1) git pull origin main ===" -ForegroundColor Cyan
git fetch origin main
git checkout main
git pull origin main
$head = (git rev-parse --short HEAD)
Write-Host ("HEAD={0}" -f $head)

# --- 2) token ---
Write-Host "`n=== 2) PRICING_WORKER_TOKEN ===" -ForegroundColor Cyan
$envFile = Join-Path $lanDir ".env.lan"
if (-not (Test-Path $envFile)) { throw ".env.lan missing: $envFile" }
$token = Get-EnvValue $envFile "PRICING_WORKER_TOKEN"
if (-not $token) {
  $chars = [char[]]((48..57) + (97..122))
  $token = -join (1..48 | ForEach-Object { $chars | Get-Random })
  Set-EnvValue $envFile "PRICING_WORKER_TOKEN" $token
  Write-Host "PRICING_WORKER_TOKEN generated and written to .env.lan (not printed)."
} else {
  Write-Host "PRICING_WORKER_TOKEN already set (left unchanged)."
}

# Ensure compose passthrough exists (should be on main after #452)
$compose = Join-Path $lanDir "docker-compose.yml"
if (-not (Select-String -Path $compose -Pattern "PRICING_WORKER_TOKEN" -Quiet)) {
  throw "docker-compose.yml missing PRICING_WORKER_TOKEN passthrough — wrong checkout?"
}

# --- 3) migration ---
Write-Host "`n=== 3) migration 20260916170000 on DB postgres ===" -ForegroundColor Cyan
$pw = Get-EnvValue $envFile "POSTGRES_PASSWORD"
if (-not $pw) { throw "POSTGRES_PASSWORD missing in .env.lan" }
$dbName = "postgres"
$migRel = "supabase\migrations\20260916170000_554_enqueue_on_settlement_and_sale_price_types.sql"
$migPath = Join-Path $repoRoot $migRel
if (-not (Test-Path $migPath)) { throw "Migration file missing: $migPath" }

$exists = docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d $dbName -tAc `
  "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260916170000';"
if ($exists -match "1") {
  Write-Host "Ledger already has 20260916170000 — skip apply."
} else {
  $bytes = [System.IO.File]::ReadAllBytes($migPath)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "docker"
  $psi.Arguments = "exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d $dbName -v ON_ERROR_STOP=1 --single-transaction -f -"
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $p.StandardInput.Close()
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) {
    Write-Host $stdout
    Write-Host $stderr
    throw "Migration apply failed exit=$($p.ExitCode)"
  }
  docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d $dbName -c `
    "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260916170000') ON CONFLICT (version) DO NOTHING;"
  Write-Host "Migration applied + ledger recorded."
}

docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d $dbName -c `
  "SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_prq_settlement_types','trg_prq_sale_price_types');"

# --- 4) rebuild web ---
Write-Host "`n=== 4) rebuild web --no-deps ===" -ForegroundColor Cyan
$env:GIT_SHA = $head
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file $envFile -f (Join-Path $lanDir "docker-compose.yml") up -d --no-deps --build web
Start-Sleep -Seconds 5
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA"
docker exec afrakala-lan-web sh -c 'if [ -n "$PRICING_WORKER_TOKEN" ]; then echo PRICING_TOKEN=PRESENT; else echo PRICING_TOKEN=MISSING; fi'
$appPort = Get-EnvValue $envFile "APP_PORT"
if (-not $appPort) { $appPort = "3000" }
try {
  $hz = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 ("http://127.0.0.1:{0}/api/healthz" -f $appPort)
  Write-Host ("healthz={0}" -f $hz.StatusCode)
} catch {
  Write-Host ("healthz_err={0}" -f $_.Exception.Message)
}

# --- 5) Task Scheduler ---
Write-Host "`n=== 5) register pricing worker task ===" -ForegroundColor Cyan
$reg = Join-Path $scriptDir "register-pricing-worker-live-task.ps1"
if (-not (Test-Path $reg)) { throw "Missing $reg" }
& powershell -NoProfile -ExecutionPolicy Bypass -File $reg

Write-Host "`nDONE. Verify:" -ForegroundColor Green
Write-Host "  - APP_GIT_SHA matches git HEAD"
Write-Host "  - PRICING_TOKEN=PRESENT"
Write-Host "  - Task AfraKala-PricingWorker-Live Ready/Running"
Write-Host "  - Change a purchase price; within ~1 min sale price updates without manual publish"
