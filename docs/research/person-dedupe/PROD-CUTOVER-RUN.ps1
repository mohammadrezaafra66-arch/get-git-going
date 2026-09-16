# =============================================================================
# AfraKala PROD CUTOVER RUNNER (ASCII, PowerShell 5.1)
# Live tree: C:\afrakala | Port 3000 | DB postgres @ afrakala-lan-db
# Source tip: feature/sales-desk (same as test :3100)
#
# USAGE (Admin PowerShell on PRODUCTION):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\PROD-CUTOVER-RUN.ps1 -IApproveProductionMigrations
#
# Without -IApproveProductionMigrations the script only pulls code + reports
# missing migrations; it will NOT apply SQL or rebuild.
# Signature: PowerShell 5.1 safe ASCII CUTOVER
# =============================================================================

param(
  [switch]$IApproveProductionMigrations,
  [switch]$SkipTasks,
  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
$Root = "C:\afrakala"
$EnvFile = Join-Path $Root "deploy\lan\.env.lan"
$Compose = Join-Path $Root "deploy\lan\docker-compose.yml"
$MigDir = Join-Path $Root "supabase\migrations"
$Db = "afrakala-lan-db"
$DbName = "postgres"
$ExpectedBranch = "feature/sales-desk"

function Section([string]$t) {
  Write-Host ""
  Write-Host "========================================================================"
  Write-Host $t
  Write-Host "========================================================================"
}
function Fail([string]$m) { throw $m }

if (-not (Test-Path -LiteralPath $Root)) { Fail "Missing live tree: $Root" }
if (-not (Test-Path -LiteralPath $EnvFile)) { Fail "Missing env: $EnvFile" }
if (-not (Test-Path -LiteralPath $Compose)) { Fail "Missing compose: $Compose" }

Section "0) GATE"
if (-not $IApproveProductionMigrations) {
  Write-Host "DRY / PRECHECK MODE - no migrate, no rebuild."
  Write-Host "To apply everything, re-run with: -IApproveProductionMigrations"
} else {
  Write-Host "MIGRATE_PROD_APPROVED = YES (switch present)"
}

Section "1) CODE PULL"
Set-Location -LiteralPath $Root
git fetch origin
git checkout $ExpectedBranch
git pull origin $ExpectedBranch
$head = (git rev-parse --short HEAD).Trim()
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "branch=$branch HEAD=$head"
if ($branch -ne $ExpectedBranch) { Fail "Expected branch $ExpectedBranch" }
if (-not (Test-Path ".\src\routes\_app.admin.persons-cleanup.tsx")) { Fail "persons-cleanup missing - wrong tree?" }
if (-not (Test-Path ".\supabase\migrations\20260916160000_552_call_ring_events.sql")) { Fail "ring migration missing" }

Section "2) ENV PRESENCE (no values)"
Select-String -Path $EnvFile -Pattern '^(APP_PORT|ISSABEL_|PRICING_WORKER_TOKEN)=' |
  ForEach-Object { ($_.Line -split '=', 2)[0] }
$raw = Get-Content -LiteralPath $EnvFile -Raw
if ($raw -notmatch '(?m)^\s*PRICING_WORKER_TOKEN\s*=\s*\S') {
  if ($IApproveProductionMigrations) {
    $pricingToken = -join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
    Add-Content -Path $EnvFile -Value ""
    Add-Content -Path $EnvFile -Value ("# cutover pricing token " + (Get-Date -Format o))
    Add-Content -Path $EnvFile -Value ("PRICING_WORKER_TOKEN=" + $pricingToken)
    Write-Host "Appended PRICING_WORKER_TOKEN"
  } else {
    Write-Host "NOTE: PRICING_WORKER_TOKEN missing (will append when approved)"
  }
} else {
  Write-Host "PRICING_WORKER_TOKEN already present"
}

$line = (Select-String -Path $EnvFile -Pattern '^\s*POSTGRES_PASSWORD\s*=' | Select-Object -First 1).Line
if (-not $line) { Fail "POSTGRES_PASSWORD missing in .env.lan" }
$pw = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")

$need = @(
  "20260915233000",
  "20260916001500",
  "20260916030000",
  "20260916031000",
  "20260916032000",
  "20260916033000",
  "20260916120000",
  "20260916121000",
  "20260916122000",
  "20260916123000",
  "20260916140000",
  "20260916150000",
  "20260916160000",
  "20260916161000",
  "20260916162000",
  "20260916170000",
  "20260916190000",
  "20260916200000"
)

Section "3) LEDGER + MISSING LIST"
$haveRaw = docker exec -e "PGPASSWORD=$pw" $Db psql -U supabase_admin -d $DbName -t -A -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '20260915000000';"
$haveSet = @{}
$haveRaw -split "`n" | ForEach-Object { if ($_.Trim()) { $haveSet[$_.Trim()] = $true } }
$missing = @()
foreach ($v in $need) {
  if ($haveSet.ContainsKey($v)) { Write-Host "HAVE $v" }
  else {
    Write-Host "NEED $v"
    $missing += $v
  }
}
Write-Host ("missing_count=" + $missing.Count)

if (-not $IApproveProductionMigrations) {
  Section "STOP (precheck only)"
  Write-Host "Reply to agent with this block, then re-run WITH -IApproveProductionMigrations:"
  Write-Host ("PRECHECK_OK HEAD=" + $head + " missing=" + ($missing -join ","))
  exit 0
}

if (-not $SkipBackup) {
  Section "4) DB BACKUP"
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $bakDir = Join-Path $Root "backups"
  New-Item -ItemType Directory -Force -Path $bakDir | Out-Null
  $remote = "/tmp/prod-pre-cutover-$stamp.dump"
  $local = Join-Path $bakDir "prod-pre-cutover-$stamp.dump"
  docker exec -e "PGPASSWORD=$pw" $Db pg_dump -U postgres -d $DbName -Fc -f $remote
  if ($LASTEXITCODE -ne 0) { Fail "pg_dump failed" }
  docker cp "${Db}:${remote}" $local
  if (-not (Test-Path -LiteralPath $local)) { Fail "backup missing: $local" }
  Get-Item -LiteralPath $local | Format-List FullName, Length, LastWriteTime
  Write-Host ("BACKUP_OK " + $local)
}

Section "5) APPLY MISSING MIGRATIONS"
foreach ($v in $missing) {
  $file = Get-ChildItem -Path $MigDir -Filter ($v + "_*.sql") | Select-Object -First 1
  if (-not $file) { Fail ("MISSING FILE for " + $v) }
  Write-Host ("APPLY " + $file.Name)
  # Byte-safe pipe via Node (avoids PowerShell UTF8 mangling)
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    & node -e "process.stdout.write(require('fs').readFileSync(process.argv[1]))" $file.FullName |
      docker exec -i -e "PGPASSWORD=$pw" $Db psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 --single-transaction
  } else {
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $tmp = Join-Path $env:TEMP ("mig-" + $v + ".sql")
    [System.IO.File]::WriteAllBytes($tmp, $bytes)
    cmd /c "type `"$tmp`" | docker exec -i -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 --single-transaction"
  }
  if ($LASTEXITCODE -ne 0) { Fail ("Migration failed: " + $file.Name) }
  docker exec -e "PGPASSWORD=$pw" $Db psql -U supabase_admin -d $DbName -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$v') ON CONFLICT DO NOTHING;"
  Write-Host ("OK " + $v)
}

docker exec -e "PGPASSWORD=$pw" $Db psql -U supabase_admin -d $DbName -c "NOTIFY pgrst, 'reload schema';"
docker restart afrakala-lan-rest
Start-Sleep -Seconds 5
docker exec -e "PGPASSWORD=$pw" $Db psql -U supabase_admin -d $DbName -c "SELECT to_regclass('public.work_items') AS work_items, to_regclass('public.sales_interactions') AS sales_interactions, to_regclass('public.call_ring_events') AS call_ring_events, to_regclass('public.torob_ops_credentials') AS torob_ops; SELECT public.person_detect_merge_candidates(NULL);"

Section "6) REBUILD WEB"
$env:GIT_SHA = $head
$env:BUILD_TIME = (Get-Date -Format o)
Write-Host ("Building GIT_SHA=" + $env:GIT_SHA)
docker compose --env-file $EnvFile -f $Compose up -d --no-deps --build web
Start-Sleep -Seconds 8
docker ps --filter "name=afrakala-lan-web" --format '{{.Status}}'
$ver = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/version"
$ver | Format-List
if ($ver.commit -notlike ($head + "*") -and $ver.commitShort -ne $head.Substring(0, [Math]::Min(7, $head.Length))) {
  Write-Host ("WARN: version commit=" + $ver.commit + " expected~" + $head)
}

Section "7) HOST TASKS"
if (-not $SkipTasks) {
  Push-Location $Root
  try {
    if (Test-Path ".\deploy\lan\scripts\register-issabel-import-live-task.ps1") {
      powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\lan\scripts\register-issabel-import-live-task.ps1"
    }
    if (Test-Path ".\deploy\lan\scripts\register-issabel-cel-ring-task.ps1") {
      powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\lan\scripts\register-issabel-cel-ring-task.ps1"
    }
    if (Test-Path ".\deploy\lan\scripts\register-pricing-worker-live-task.ps1") {
      powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\lan\scripts\register-pricing-worker-live-task.ps1"
    }
    if (Test-Path ".\deploy\lan\scripts\hide-afrakala-live-tasks.ps1") {
      powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\lan\scripts\hide-afrakala-live-tasks.ps1"
    }
  } finally { Pop-Location }
  Start-ScheduledTask -TaskName "AfraKala-IssabelImport-Live" -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName "AfraKala-IssabelCelRing" -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName "AfraKala-PricingWorker-Live" -ErrorAction SilentlyContinue
}

Section "8) SMOKE"
foreach ($p in @(
  "/operations/sales-desk",
  "/operations/work",
  "/operations/call-activity",
  "/admin/persons-cleanup",
  "/persons/merge",
  "/torob-ops",
  "/pricing/quick-price"
)) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ("http://127.0.0.1:3000" + $p) -MaximumRedirection 0
    Write-Host ($p + " -> " + $r.StatusCode)
  } catch {
    if ($_.Exception.Response) {
      Write-Host ($p + " -> " + [int]$_.Exception.Response.StatusCode)
    } else {
      Write-Host ($p + " -> FAIL " + $_.Exception.Message)
    }
  }
}

Section "DONE"
Write-Host "Copy this reply to the agent (no secrets):"
Write-Host ("CUTOVER_OK HEAD=" + $head + " VERSION=" + $ver.commit + " WEB=check-above")
