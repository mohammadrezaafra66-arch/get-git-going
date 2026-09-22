#Requires -Version 5.1
<#
.SYNOPSIS
  Transfer Caller ID prefs + Work (ticket) taxonomy catalog from tip to PRODUCTION :3000.

.DESCRIPTION
  Run as Administrator on the PRODUCTION laptop (C:\afrakala, APP_PORT=3000).
  Scope:
    - Migration 558: user_caller_id_settings (+ open call_ring_events SELECT)
    - Migration 559: work_taxonomies AfraKala catalog (ticket tab labels)
    - Web rebuild (Caller ID UI + settings page + CEL classify/poller files)
    - Re-register CEL ring task (direct-inbound path)

  Never: docker compose down -v
  Never prints secrets.
  ASCII-only for Windows PowerShell 5.1.

.EXAMPLE
  cd C:\afrakala
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\prod-cutover-caller-id-work.ps1 -IApproveProdMigrate
#>
[CmdletBinding()]
param(
  [switch]$IApproveProdMigrate,
  [string]$RepoRoot = "C:\afrakala",
  [string]$Branch = "feature/sales-desk",
  [string]$DbContainer = "afrakala-lan-db",
  [int]$AppPort = 3000
)

$ErrorActionPreference = "Stop"

function Fail([string]$Msg) {
  Write-Host ("FAIL: " + $Msg) -ForegroundColor Red
  throw $Msg
}

function Get-EnvLineValue([string]$Path, [string]$Key) {
  $line = (Select-String -Path $Path -Pattern ("^\s*" + [regex]::Escape($Key) + "\s*=") | Select-Object -First 1).Line
  if (-not $line) { return $null }
  return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

Write-Host "=== PROD CUTOVER: CALLER-ID + WORK TAXONOMIES ===" -ForegroundColor Cyan
Write-Host ("Repo=" + $RepoRoot + " Branch=" + $Branch + " Port=" + $AppPort)

if (-not $IApproveProdMigrate) {
  Fail "Refusing: pass -IApproveProdMigrate"
}

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  Fail ("Live tree missing: " + $RepoRoot)
}

Set-Location -LiteralPath $RepoRoot
$EnvFile = Join-Path $RepoRoot "deploy\lan\.env.lan"
if (-not (Test-Path -LiteralPath $EnvFile)) {
  Fail ("Missing " + $EnvFile)
}

$DbName = Get-EnvLineValue $EnvFile "POSTGRES_DB"
if ([string]::IsNullOrWhiteSpace($DbName)) { $DbName = "afrakala" }
$pw = Get-EnvLineValue $EnvFile "POSTGRES_PASSWORD"
if ([string]::IsNullOrWhiteSpace($pw)) { Fail "POSTGRES_PASSWORD missing" }

$appPortEnv = Get-EnvLineValue $EnvFile "APP_PORT"
if ($appPortEnv -and $appPortEnv -ne ("{0}" -f $AppPort)) {
  Write-Host ("WARN: APP_PORT in .env.lan is '{0}' (script expects {1}). Continuing." -f $appPortEnv, $AppPort)
}

# --- 1) Code ---
Write-Host "`n[1/5] git fetch/checkout/pull..." -ForegroundColor Yellow
git fetch origin
if ($LASTEXITCODE -ne 0) { Fail "git fetch failed" }
git checkout $Branch
if ($LASTEXITCODE -ne 0) { Fail ("git checkout " + $Branch + " failed") }
git pull origin $Branch
if ($LASTEXITCODE -ne 0) { Fail "git pull failed" }

$head = (git rev-parse --short HEAD).Trim()
Write-Host ("HEAD=" + $head)

$mustFiles = @(
  "src\routes\_app.settings.caller-id.tsx",
  "src\lib\calls\caller-id-settings.ts",
  "src\lib\calls\filter-calls-for-caller-id.ts",
  "src\components\sales-desk\CallerInboundPopup.tsx",
  "deploy\lan\scripts\issabel-cel-ring-classify.mjs",
  "deploy\lan\scripts\issabel-cel-ring-poller.mjs",
  "supabase\migrations\20260919180000_558_user_caller_id_settings.sql",
  "supabase\migrations\20260916230000_559_work_taxonomies_afrakala_catalog.sql"
)
foreach ($rel in $mustFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $rel))) {
    Fail ("Missing required file after pull: " + $rel)
  }
}

$sidebarPath = Join-Path $RepoRoot "src\components\layout\AppSidebar.tsx"
$sidebarOk = (Select-String -Path $sidebarPath -Pattern "/settings/caller-id" -SimpleMatch -Quiet)
if (-not $sidebarOk) {
  Fail "Sidebar missing /settings/caller-id link"
}
Write-Host "CODE_OK"

# --- 2) Backup ---
Write-Host "`n[2/5] DB backup..." -ForegroundColor Yellow
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bakDir = Join-Path $RepoRoot "backups"
New-Item -ItemType Directory -Force -Path $bakDir | Out-Null
$remote = ("/tmp/prod-caller-work-{0}.dump" -f $stamp)
$local = Join-Path $bakDir ("prod-caller-work-{0}.dump" -f $stamp)

docker exec -e PGPASSWORD=$pw $DbContainer pg_dump -U postgres -d $DbName -Fc -f $remote
if ($LASTEXITCODE -ne 0) {
  docker exec -e PGPASSWORD=$pw $DbContainer pg_dump -U supabase_admin -d $DbName -Fc -f $remote
  if ($LASTEXITCODE -ne 0) { Fail "pg_dump failed" }
}
docker cp ("{0}:{1}" -f $DbContainer, $remote) $local
if (-not (Test-Path -LiteralPath $local)) { Fail ("backup file missing: " + $local) }
$bakItem = Get-Item -LiteralPath $local
Write-Host ("BACKUP_OK {0} size={1}" -f $bakItem.FullName, $bakItem.Length)

# --- 3) Migrations (558 caller-id, 559 work catalog) ---
Write-Host "`n[3/5] apply migrations 558 + 559 if missing..." -ForegroundColor Yellow
$MigDir = Join-Path $RepoRoot "supabase\migrations"
# Order by version timestamp prefix
$need = @(
  "20260916230000",
  "20260919180000"
)

$haveRaw = docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -t -A -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version IN ('20260916230000','20260919180000');"
$haveSet = @{}
($haveRaw -split "`n") | ForEach-Object { if ($_.Trim()) { $haveSet[$_.Trim()] = $true } }

foreach ($v in $need) {
  if ($haveSet.ContainsKey($v)) {
    Write-Host ("SKIP {0}" -f $v)
    continue
  }
  $file = Get-ChildItem -Path $MigDir -Filter ($v + "_*.sql") | Select-Object -First 1
  if (-not $file) { Fail ("MISSING FILE for " + $v + " in " + $MigDir) }
  Write-Host ("APPLY {0} ..." -f $file.Name)
  # Byte-safe: never pipe Persian SQL through PowerShell (becomes ????)
  $remote = ("/tmp/cutover_{0}.sql" -f $v)
  docker cp $file.FullName ("{0}:{1}" -f $DbContainer, $remote)
  if ($LASTEXITCODE -ne 0) { Fail ("docker cp failed for " + $file.Name) }
  docker exec -e PGPASSWORD=$pw $DbContainer `
    psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 --single-transaction `
    -c "SET client_encoding TO 'UTF8';" `
    -f $remote
  if ($LASTEXITCODE -ne 0) { Fail ("Migration failed: " + $file.Name) }
  docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -c ("INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('{0}') ON CONFLICT DO NOTHING;" -f $v)
  Write-Host ("OK {0}" -f $v)
}

docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -c "NOTIFY pgrst, 'reload schema';"
docker restart afrakala-lan-rest | Out-Null
Start-Sleep -Seconds 5

Write-Host "--- DB check ---"
docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -c "SELECT to_regclass('public.user_caller_id_settings') AS user_caller_id_settings;"
docker exec -e PGPASSWORD=$pw $DbContainer psql -U supabase_admin -d $DbName -c "SELECT kind, count(*) FROM public.work_taxonomies WHERE deleted_at IS NULL AND is_active GROUP BY kind ORDER BY 1;"

# --- 4) Rebuild web + CEL task ---
Write-Host "`n[4/5] rebuild web + register CEL poller..." -ForegroundColor Yellow
$env:GIT_SHA = $head
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file $EnvFile -f (Join-Path $RepoRoot "deploy\lan\docker-compose.yml") up -d --no-deps --build web
if ($LASTEXITCODE -ne 0) { Fail "web build/up failed" }

$ok = $false
for ($i = 1; $i -le 48; $i++) {
  Start-Sleep -Seconds 5
  $st = docker ps --filter name=afrakala-lan-web --format "{{.Status}}"
  Write-Host ("web try {0} : {1}" -f $i, $st)
  if ($st -match "healthy") { $ok = $true; break }
}
if (-not $ok) { Fail "web not healthy" }

$celScript = Join-Path $RepoRoot "deploy\lan\scripts\register-issabel-cel-ring-task.ps1"
if (Test-Path -LiteralPath $celScript) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $celScript
  Write-Host ("CEL_REGISTER_EXIT=" + $LASTEXITCODE)
} else {
  Write-Host "WARN: register-issabel-cel-ring-task.ps1 missing"
}

# --- 5) Smoke ---
Write-Host "`n[5/5] smoke..." -ForegroundColor Yellow
$base = ("http://127.0.0.1:{0}" -f $AppPort)
$ver = Invoke-RestMethod ($base + "/api/version") -TimeoutSec 30
Write-Host ("VERSION commit={0} env={1}" -f $ver.commit, $ver.environment)

$sha = (docker compose --env-file $EnvFile -f (Join-Path $RepoRoot "deploy\lan\docker-compose.yml") exec -T web printenv APP_GIT_SHA).Trim()
Write-Host ("APP_GIT_SHA=" + $sha)
if ($sha -ne $head) {
  Write-Host ("WARN: container SHA {0} != HEAD {1}" -f $sha, $head)
}

foreach ($p in @("/settings/caller-id", "/operations/work", "/operations/sales-desk", "/admin/call-extensions")) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ($base + $p) -MaximumRedirection 0
    Write-Host ("SMOKE {0} -> {1}" -f $p, $r.StatusCode)
  } catch {
    if ($_.Exception.Response) {
      Write-Host ("SMOKE {0} -> {1}" -f $p, [int]$_.Exception.Response.StatusCode)
    } else {
      Fail ("SMOKE " + $p + " FAIL " + $_.Exception.Message)
    }
  }
}

Write-Host "`n=== CUTOVER_CALLER_WORK_DONE HEAD=$head ===" -ForegroundColor Green
Write-Host "Manual: Ctrl+F5 on :3000 -> settings/caller-id + work ticket tab + inbound call card bottom-right"
