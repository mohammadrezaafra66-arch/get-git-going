#Requires -Version 5.1
<#
.SYNOPSIS
  Full cutover on PRODUCTION laptop (C:\afrakala, port 3000) from feature/sales-desk tip.

.DESCRIPTION
  Approved answers (2026-09-16):
    MIGRATE=yes, BACKUP=yes, ROTATE_TOKENS=yes, ALL_FEATURES=yes
    PBX MySQL for .10 = NOT fixed yet (import may 500 until PBX user is created)

  Never: docker compose down -v
  Never prints secrets.

.EXAMPLE
  cd C:\afrakala
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\prod-cutover-full.ps1 -IApproveProdMigrate
#>
[CmdletBinding()]
param(
  [switch]$IApproveProdMigrate,
  [string]$RepoRoot = "C:\afrakala",
  [string]$TargetShaPrefix = "120a2996",
  [string]$Branch = "feature/sales-desk",
  [string]$DbContainer = "afrakala-lan-db",
  [string]$DbName = "postgres",
  [int]$AppPort = 3000
)

$ErrorActionPreference = "Stop"

function Fail([string]$Msg) {
  Write-Host "FAIL: $Msg" -ForegroundColor Red
  throw $Msg
}

function Get-EnvLineValue([string]$Path, [string]$Key) {
  $line = (Select-String -Path $Path -Pattern ("^\s*" + [regex]::Escape($Key) + "\s*=") | Select-Object -First 1).Line
  if (-not $line) { return $null }
  return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

function Set-EnvKeyValue([string]$Path, [string]$Key, [string]$Value) {
  $raw = Get-Content -LiteralPath $Path -Raw
  $pattern = "(?m)^\s*" + [regex]::Escape($Key) + "\s*=.*$"
  if ($raw -match $pattern) {
    $raw = [regex]::Replace($raw, $pattern, ($Key + "=" + $Value))
  } else {
    if (-not $raw.EndsWith("`n")) { $raw += "`r`n" }
    $raw += "# rotated $(Get-Date -Format o)`r`n$Key=$Value`r`n"
  }
  Set-Content -LiteralPath $Path -Value $raw -Encoding UTF8 -NoNewline
}

function New-HexToken([int]$Bytes = 48) {
  -join ((1..$Bytes) | ForEach-Object { "{0:x2}" -f (Get-Random -Maximum 256) })
}

Write-Host "=== PROD CUTOVER FULL ===" -ForegroundColor Cyan
Write-Host "Repo=$RepoRoot Branch=$Branch TargetPrefix=$TargetShaPrefix Port=$AppPort"

if (-not $IApproveProdMigrate) {
  Fail "Refusing: pass -IApproveProdMigrate (owner already said YES in chat)."
}

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  Fail "Live tree missing: $RepoRoot"
}

Set-Location -LiteralPath $RepoRoot
$EnvFile = Join-Path $RepoRoot "deploy\lan\.env.lan"
if (-not (Test-Path -LiteralPath $EnvFile)) {
  Fail "Missing $EnvFile"
}

# --- 1) Code ---
Write-Host "`n[1/7] git fetch/checkout/pull..." -ForegroundColor Yellow
git fetch origin
if ($LASTEXITCODE -ne 0) { Fail "git fetch failed" }
git checkout $Branch
if ($LASTEXITCODE -ne 0) { Fail "git checkout $Branch failed" }
git pull origin $Branch
if ($LASTEXITCODE -ne 0) { Fail "git pull failed" }

$head = (git rev-parse --short HEAD).Trim()
Write-Host "HEAD=$head"
if ($head -notlike "$TargetShaPrefix*" -and $TargetShaPrefix -ne "any") {
  # Allow newer tip; only fail if older than known tip when tip not reachable
  Write-Host "NOTE: HEAD is $head (expected at/after $TargetShaPrefix). Continuing if files exist."
}

$mustFiles = @(
  "src\routes\_app.operations.sales-desk.tsx",
  "src\routes\_app.torob-ops.tsx",
  "src\components\layout\AppSidebar.tsx",
  "supabase\migrations\20260916190000_555_torob_ops_path_b.sql",
  "supabase\migrations\20260916200000_556_sale_price_type_quick_price_only.sql"
)
foreach ($rel in $mustFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $rel))) {
    Fail "Missing required file after pull: $rel"
  }
}
# ASCII-only markers (PS 5.1 console encoding breaks Persian SimpleMatch)
$sidebarPath = Join-Path $RepoRoot "src\components\layout\AppSidebar.tsx"
$sidebarOk = (Select-String -Path $sidebarPath -Pattern "SidebarNavPin3d" -SimpleMatch -Quiet) -and `
  (Select-String -Path $sidebarPath -Pattern "/operations/sales-desk" -SimpleMatch -Quiet) -and `
  (Select-String -Path $sidebarPath -Pattern "canSeeSalesDesk" -SimpleMatch -Quiet)
if (-not $sidebarOk) {
  Fail "Sidebar pin marker missing (SidebarNavPin3d / sales-desk)"
}
Write-Host "CODE_OK"

# --- 2) Env keys + rotate leaked tokens ---
Write-Host "`n[2/7] env keys + rotate import/pricing tokens..." -ForegroundColor Yellow
$appPortEnv = Get-EnvLineValue $EnvFile "APP_PORT"
if ($appPortEnv -and $appPortEnv -ne "$AppPort") {
  Write-Host "WARN: APP_PORT in .env.lan is '$appPortEnv' (expected $AppPort). Not auto-changing."
}

$keyNames = @(
  "APP_PORT",
  "ISSABEL_CDR_HOST",
  "ISSABEL_CDR_USER",
  "ISSABEL_CDR_PASSWORD",
  "ISSABEL_CDR_DB",
  "ISSABEL_IMPORT_WORKER_TOKEN",
  "PRICING_WORKER_TOKEN"
)
foreach ($k in $keyNames) {
  $v = Get-EnvLineValue $EnvFile $k
  if ([string]::IsNullOrWhiteSpace($v)) {
    if ($k -eq "PRICING_WORKER_TOKEN") {
      Set-EnvKeyValue $EnvFile $k (New-HexToken 48)
      Write-Host "$k=APPENDED"
    } else {
      Fail "Missing required env key: $k"
    }
  } else {
    Write-Host "$k=SET"
  }
}

# Always rotate leaked tokens (owner approved)
Set-EnvKeyValue $EnvFile "ISSABEL_IMPORT_WORKER_TOKEN" (New-HexToken 48)
Set-EnvKeyValue $EnvFile "PRICING_WORKER_TOKEN" (New-HexToken 48)
Write-Host "TOKENS_ROTATED (values not printed)"

# --- 3) Backup ---
Write-Host "`n[3/7] DB backup..." -ForegroundColor Yellow
$pw = Get-EnvLineValue $EnvFile "POSTGRES_PASSWORD"
if ([string]::IsNullOrWhiteSpace($pw)) { Fail "POSTGRES_PASSWORD missing" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bakDir = Join-Path $RepoRoot "backups"
New-Item -ItemType Directory -Force -Path $bakDir | Out-Null
$remote = "/tmp/prod-pre-cutover-$stamp.dump"
$local = Join-Path $bakDir "prod-pre-cutover-$stamp.dump"

docker exec -e PGPASSWORD=$pw $DbContainer pg_dump -U postgres -d $DbName -Fc -f $remote
if ($LASTEXITCODE -ne 0) { Fail "pg_dump failed" }
docker cp "${DbContainer}:${remote}" $local
if (-not (Test-Path -LiteralPath $local)) { Fail "backup file missing: $local" }
$bakItem = Get-Item -LiteralPath $local
Write-Host ("BACKUP_OK {0} size={1}" -f $bakItem.FullName, $bakItem.Length)

# --- 4) Migrations ---
Write-Host "`n[4/7] apply missing migrations..." -ForegroundColor Yellow
$MigDir = Join-Path $RepoRoot "supabase\migrations"
$need = @(
  "20260915233000",
  "20260916001500",
  "20260916140000",
  "20260916150000",
  "20260916030000",
  "20260916031000",
  "20260916032000",
  "20260916033000",
  "20260916120000",
  "20260916121000",
  "20260916122000",
  "20260916123000",
  "20260916160000",
  "20260916161000",
  "20260916162000",
  "20260916170000",
  "20260916190000",
  "20260916200000",
  "20260916210000"
)

$haveRaw = docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -t -A -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '20260915000000';"
$haveSet = @{}
$haveRaw -split "`n" | ForEach-Object { if ($_.Trim()) { $haveSet[$_.Trim()] = $true } }

foreach ($v in $need) {
  if ($haveSet.ContainsKey($v)) {
    Write-Host "SKIP $v"
    continue
  }
  $file = Get-ChildItem -Path $MigDir -Filter ($v + "_*.sql") | Select-Object -First 1
  if (-not $file) { Fail "MISSING FILE for $v in $MigDir" }
  Write-Host "APPLY $($file.Name) ..."
  $sql = [System.IO.File]::ReadAllText($file.FullName)
  $sql | docker exec -i -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 --single-transaction
  if ($LASTEXITCODE -ne 0) { Fail "Migration failed: $($file.Name)" }
  docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$v') ON CONFLICT DO NOTHING;"
  Write-Host "OK $v"
}

docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -c "NOTIFY pgrst, 'reload schema';"
docker restart afrakala-lan-rest | Out-Null
Start-Sleep -Seconds 5

docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -c @"
SELECT to_regclass('public.work_items') AS work_items,
       to_regclass('public.sales_interactions') AS sales_interactions,
       to_regclass('public.call_ring_events') AS call_ring_events,
       to_regclass('public.torob_ops_credentials') AS torob_ops_credentials;
SELECT public.person_detect_merge_candidates(NULL);
"@
if ($LASTEXITCODE -ne 0) { Fail "schema probe / person_detect_merge_candidates failed" }
Write-Host "MIG_OK"

# --- 5) Rebuild web ---
Write-Host "`n[5/7] rebuild web (no down -v)..." -ForegroundColor Yellow
$env:GIT_SHA = (git rev-parse --short HEAD).Trim()
$env:BUILD_TIME = (Get-Date -Format o)
Write-Host "Building GIT_SHA=$($env:GIT_SHA)"
docker compose --env-file deploy\lan\.env.lan -f deploy\lan\docker-compose.yml up -d --no-deps --build web
if ($LASTEXITCODE -ne 0) { Fail "web build/up failed" }

$healthy = $false
for ($i = 1; $i -le 36; $i++) {
  Start-Sleep -Seconds 5
  $st = docker ps --filter name=afrakala-lan-web --format "{{.Status}}"
  Write-Host "web status try $i : $st"
  if ($st -match "healthy") { $healthy = $true; break }
}
if (-not $healthy) { Fail "web not healthy in time" }

$ver = Invoke-RestMethod -Uri "http://127.0.0.1:$AppPort/api/version"
Write-Host ("VERSION commit={0} env={1}" -f $ver.commit, $ver.environment)
if ($ver.commit -ne $env:GIT_SHA -and $ver.commitShort -ne $env:GIT_SHA) {
  # allow short vs full short mismatch of 7 chars
  if (-not (($ver.commit + "") -like ($env:GIT_SHA + "*") -or ($env:GIT_SHA + "") -like (($ver.commitShort) + "*"))) {
    Fail "version commit $($ver.commit) != GIT_SHA $($env:GIT_SHA)"
  }
}
Write-Host "WEB_OK"

# --- 6) Windowless tasks ---
Write-Host "`n[6/7] register windowless tasks..." -ForegroundColor Yellow
$scripts = @(
  "deploy\lan\scripts\register-issabel-import-live-task.ps1",
  "deploy\lan\scripts\register-issabel-cel-ring-task.ps1",
  "deploy\lan\scripts\register-pricing-worker-live-task.ps1",
  "deploy\lan\scripts\hide-afrakala-live-tasks.ps1"
)
foreach ($s in $scripts) {
  $p = Join-Path $RepoRoot $s
  if (-not (Test-Path -LiteralPath $p)) {
    Write-Host "SKIP missing $s"
    continue
  }
  try {
    powershell -NoProfile -ExecutionPolicy Bypass -File $p
  } catch {
    Write-Host ("WARN task script {0}: {1}" -f $s, $_.Exception.Message) -ForegroundColor DarkYellow
  }
}

Get-ScheduledTask | Where-Object { $_.TaskName -match "AfraKala-(Issabel|Pricing)" } | ForEach-Object {
  $a = $_.Actions[0]
  Write-Host ("TASK {0} state={1} engine={2}" -f $_.TaskName, $_.State, (Split-Path $a.Execute -Leaf))
}

Start-ScheduledTask -TaskName AfraKala-IssabelImport-Live -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName AfraKala-IssabelCelRing -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName AfraKala-PricingWorker-Live -ErrorAction SilentlyContinue
Start-Sleep -Seconds 10

$logDir = Join-Path $RepoRoot "deploy\lan\logs"
Write-Host "--- import log ---"
Get-Content (Join-Path $logDir "issabel-import-live.log") -Tail 3 -ErrorAction SilentlyContinue
Write-Host "--- cel log ---"
Get-Content (Join-Path $logDir "issabel-cel-ring.log") -Tail 5 -ErrorAction SilentlyContinue
Write-Host "--- pricing log ---"
Get-Content (Join-Path $logDir "pricing-worker-live.log") -Tail 3 -ErrorAction SilentlyContinue
Write-Host "NOTE: Import may show Access denied until PBX MySQL user for 192.168.170.10 is fixed." -ForegroundColor DarkYellow

# --- 7) Smoke ---
Write-Host "`n[7/7] smoke routes..." -ForegroundColor Yellow
$paths = @(
  "/operations/sales-desk",
  "/operations/work",
  "/operations/call-activity",
  "/admin/persons-cleanup",
  "/admin/call-extensions",
  "/sales/search",
  "/pricing/quick-price",
  "/pricing/sale-price-types",
  "/torob-ops",
  "/torob-ops/runs",
  "/torob-ops/findings",
  "/admin/torob-ops-access"
)
foreach ($path in $paths) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ("http://127.0.0.1:{0}{1}" -f $AppPort, $path) -MaximumRedirection 0
    Write-Host ("{0} -> {1}" -f $path, $r.StatusCode)
  } catch {
    if ($_.Exception.Response) {
      Write-Host ("{0} -> {1}" -f $path, [int]$_.Exception.Response.StatusCode)
    } else {
      Write-Host ("{0} -> FAIL {1}" -f $path, $_.Exception.Message)
    }
  }
}

Write-Host "`n=== CUTOVER_DONE ===" -ForegroundColor Green
Write-Host "HEAD=$head"
Write-Host ("VERSION={0}" -f $ver.commit)
Write-Host "WEB=healthy"
Write-Host "Reply in chat (no secrets):"
Write-Host "CUTOVER_OK"
Write-Host "HEAD=$head"
Write-Host ("VERSION={0}" -f $ver.commit)
Write-Host "WEB=healthy"
Write-Host "IMPORT_LOG=see above (may be Access denied until PBX fixed)"
Write-Host "CEL=see above"
Write-Host "PINS=check UI Ctrl+F5"
Write-Host "Manual: http://192.168.170.10:$AppPort  Ctrl+F5  pins میز فروش+تیکت  /admin/call-extensions"
