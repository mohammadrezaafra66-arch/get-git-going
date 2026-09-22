# =============================================================================
# AfraKala PROD CUTOVER ALL - C:\afrakala port 3000
# PowerShell 5.1 safe. ASCII-only. Run as Administrator on PRODUCTION only.
# Transfers everything from staging (LAN :3100 tip) to live :3000.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\PROD-CUTOVER-ALL.ps1 -ApproveMigrations
#
# Signature: PROD-CUTOVER-ALL v2
# =============================================================================

param(
  [switch]$ApproveMigrations,
  [switch]$SkipHostTasks,
  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
$Root = "C:\afrakala"
$Lan = Join-Path $Root "deploy\lan"
$EnvFile = Join-Path $Lan ".env.lan"
$Compose = Join-Path $Lan "docker-compose.yml"
$MigDir = Join-Path $Root "supabase\migrations"
$DbContainer = "afrakala-lan-db"
$WebContainer = "afrakala-lan-web"
$DbName = "postgres"
$Branch = "staging"
$LogDir = Join-Path $env:TEMP "afrakala-cutover"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ("CUTOVER-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

function Log([string]$m) {
  $line = ("[{0}] {1}" -f (Get-Date -Format o), $m)
  Write-Host $line
  Add-Content -LiteralPath $Log -Value $line
}
function Section([string]$t) {
  Log ""
  Log ("==== " + $t + " ====")
}
function Fail([string]$m) {
  Log ("FAIL: " + $m)
  throw $m
}
function Get-PgPassword {
  $line = (Select-String -LiteralPath $EnvFile -Pattern '^\s*POSTGRES_PASSWORD\s*=' | Select-Object -First 1).Line
  if (-not $line) { Fail "POSTGRES_PASSWORD missing in $EnvFile" }
  return ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
}

if (-not $ApproveMigrations) {
  Write-Host "Refusing to run without -ApproveMigrations"
  Write-Host "Example:"
  Write-Host '  powershell -NoProfile -ExecutionPolicy Bypass -File PROD-CUTOVER-ALL.ps1 -ApproveMigrations'
  exit 2
}

Section "0 PRECHECK"
if (-not (Test-Path -LiteralPath $Root)) { Fail "Missing $Root" }
if (-not (Test-Path -LiteralPath $EnvFile)) { Fail "Missing $EnvFile" }
if (-not (Test-Path -LiteralPath $Compose)) { Fail "Missing $Compose" }
if (-not (Test-Path -LiteralPath $MigDir)) { Fail "Missing $MigDir" }

try {
  $null = docker version 2>&1
} catch {
  Fail "Docker not responding. Restart Docker Desktop, wait until Running, then retry."
}
$psOut = docker ps --format '{{.Names}} {{.Status}}' 2>&1
if ($LASTEXITCODE -ne 0) {
  Fail ("docker ps failed (engine 500?). Restart Docker Desktop. Detail: " + $psOut)
}
Log ("docker_ps_ok")
$psOut | ForEach-Object { Log ("  " + $_) }

$cwd = docker inspect $WebContainer --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>$null
Log ("live_compose_working_dir=" + $cwd)
if ($cwd -and ($cwd -notmatch '(?i)\\afrakala\\deploy\\lan')) {
  Fail "Live web is not C:\afrakala\deploy\lan - aborting"
}

$pw = Get-PgPassword
Log "PRECHECK OK"
Log ("log_file=" + $Log)

Section "1 GIT PULL staging"
Set-Location -LiteralPath $Root
git fetch origin 2>&1 | ForEach-Object { Log ($_.ToString()) }
git checkout $Branch 2>&1 | ForEach-Object { Log ($_.ToString()) }
git pull origin $Branch 2>&1 | ForEach-Object { Log ($_.ToString()) }
$head = (git rev-parse --short HEAD).Trim()
Log ("HEAD=" + $head)
if (-not (Test-Path -LiteralPath (Join-Path $Root "src\components\work\WorkBoardPage.tsx"))) {
  Fail "WorkBoardPage.tsx missing after pull - wrong tree?"
}

Section "2 ENV KEYS (presence only)"
$raw = Get-Content -LiteralPath $EnvFile -Raw
Select-String -LiteralPath $EnvFile -Pattern '^(APP_PORT|ISSABEL_|PRICING_WORKER_TOKEN)=' |
  ForEach-Object { Log (("env_key=" + ($_.Line -split '=', 2)[0])) }
if ($raw -notmatch '(?m)^\s*PRICING_WORKER_TOKEN\s*=\s*\S') {
  $pricingToken = -join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
  Add-Content -LiteralPath $EnvFile -Value ""
  Add-Content -LiteralPath $EnvFile -Value ("# cutover pricing token " + (Get-Date -Format o))
  Add-Content -LiteralPath $EnvFile -Value ("PRICING_WORKER_TOKEN=" + $pricingToken)
  Log "Appended PRICING_WORKER_TOKEN"
} else {
  Log "PRICING_WORKER_TOKEN already present"
}

Section "3 BACKUP"
if ($SkipBackup) {
  Log "SkipBackup set - NOT recommended"
} else {
  $bakDir = Join-Path $Root "backups"
  New-Item -ItemType Directory -Force -Path $bakDir | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $local = Join-Path $bakDir ("prod-pre-cutover-" + $stamp + ".dump")

  # Preferred: dump to stdout on host (avoids docker cp / archive API 500)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "docker"
  $psi.Arguments = "exec -e PGPASSWORD=$pw $DbContainer pg_dump -U postgres -d $DbName -Fc"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $outStream = [System.IO.File]::Open($local, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  try {
    $p.StandardOutput.BaseStream.CopyTo($outStream)
  } finally {
    $outStream.Close()
  }
  $err = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) {
    if (Test-Path -LiteralPath $local) { Remove-Item -LiteralPath $local -Force -ErrorAction SilentlyContinue }
    Fail ("pg_dump failed exit=" + $p.ExitCode + " err=" + $err)
  }
  $len = (Get-Item -LiteralPath $local).Length
  if ($len -lt 500000) { Fail ("backup too small: $len bytes") }
  Log ("BACKUP_OK bytes=" + $len + " path=" + $local)
}

Section "4 MIGRATIONS"
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
  "20260916200000"
)

$haveRaw = docker exec -e "PGPASSWORD=$pw" $DbContainer psql -U supabase_admin -d $DbName -t -A -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '20260915000000';"
if ($LASTEXITCODE -ne 0) { Fail "Cannot read schema_migrations - Docker/DB unhealthy?" }
$haveSet = @{}
$haveRaw -split "`n" | ForEach-Object { if ($_.Trim()) { $haveSet[$_.Trim()] = $true } }

foreach ($v in $need) {
  if ($haveSet.ContainsKey($v)) { Log ("SKIP " + $v); continue }
  $file = Get-ChildItem -LiteralPath $MigDir -Filter ($v + "_*.sql") | Select-Object -First 1
  if (-not $file) { Fail ("MISSING FILE for " + $v) }
  Log ("APPLY " + $file.Name)
  $sql = [System.IO.File]::ReadAllText($file.FullName)
  $sql | docker exec -i -e "PGPASSWORD=$pw" $DbContainer psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 --single-transaction
  if ($LASTEXITCODE -ne 0) { Fail ("Migration failed: " + $file.Name) }
  docker exec -e "PGPASSWORD=$pw" $DbContainer psql -U supabase_admin -d $DbName -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$v') ON CONFLICT DO NOTHING;" | Out-Null
  Log ("OK " + $v)
}

docker exec -e "PGPASSWORD=$pw" $DbContainer psql -U supabase_admin -d $DbName -c "NOTIFY pgrst, 'reload schema';" | Out-Null
docker restart afrakala-lan-rest | Out-Null
Start-Sleep -Seconds 6
$verify = docker exec -e "PGPASSWORD=$pw" $DbContainer psql -U supabase_admin -d $DbName -c "SELECT to_regclass('public.work_items') AS work_items, to_regclass('public.sales_interactions') AS sales_interactions, to_regclass('public.call_ring_events') AS call_ring_events;"
Log $verify

Section "5 REBUILD WEB"
Set-Location -LiteralPath $Root
$env:GIT_SHA = (git rev-parse --short HEAD).Trim()
$env:BUILD_TIME = (Get-Date -Format o)
Log ("Building GIT_SHA=" + $env:GIT_SHA)
docker compose --env-file $EnvFile -f $Compose up -d --no-deps --build web 2>&1 | ForEach-Object { Log ($_.ToString()) }
if ($LASTEXITCODE -ne 0) { Fail "docker compose build/up web failed" }

$deadline = (Get-Date).AddMinutes(4)
do {
  Start-Sleep -Seconds 5
  $st = docker inspect $WebContainer --format '{{.State.Health.Status}}' 2>$null
  Log ("health=" + $st)
  if ($st -eq "healthy") { break }
} while ((Get-Date) -lt $deadline)
if ($st -ne "healthy") { Fail "web not healthy in time" }

$ver = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/version" -TimeoutSec 20
Log ("version_commit=" + $ver.commit)
if ($ver.commit -ne $env:GIT_SHA -and $ver.commitShort -ne $env:GIT_SHA) {
  Log ("WARNING version commit mismatch: expected " + $env:GIT_SHA + " got " + $ver.commit)
}

Section "6 HOST TASKS"
if ($SkipHostTasks) {
  Log "SkipHostTasks set"
} else {
  $regs = @(
    "register-issabel-import-live-task.ps1",
    "register-issabel-cel-ring-task.ps1",
    "register-pricing-worker-live-task.ps1",
    "hide-afrakala-live-tasks.ps1"
  )
  foreach ($r in $regs) {
    $p = Join-Path $Lan ("scripts\" + $r)
    if (Test-Path -LiteralPath $p) {
      Log ("run " + $r)
      powershell -NoProfile -ExecutionPolicy Bypass -File $p 2>&1 | ForEach-Object { Log ($_.ToString()) }
    } else {
      Log ("missing script " + $r)
    }
  }
  foreach ($tn in @("AfraKala-IssabelImport-Live", "AfraKala-IssabelCelRing", "AfraKala-PricingWorker-Live")) {
    try { Start-ScheduledTask -TaskName $tn -ErrorAction Stop; Log ("started " + $tn) } catch { Log ("task start skip " + $tn + ": " + $_.Exception.Message) }
  }
}

Section "7 SMOKE"
$paths = @(
  "/operations/sales-desk",
  "/operations/work",
  "/operations/call-activity",
  "/admin/persons-cleanup",
  "/admin/call-extensions",
  "/sales/search",
  "/pricing/quick-price",
  "/torob-ops"
)
foreach ($path in $paths) {
  $url = "http://127.0.0.1:3000" + $path
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri $url -MaximumRedirection 0
    Log ($path + " -> " + [int]$resp.StatusCode)
  } catch {
    if ($_.Exception.Response) {
      Log ($path + " -> " + [int]$_.Exception.Response.StatusCode)
    } else {
      Log ($path + " -> FAIL " + $_.Exception.Message)
    }
  }
}

Section "DONE"
Log "CUTOVER_OK"
Log ("HEAD=" + $head)
Log ("VERSION=" + $ver.commit)
Log ("WEB=healthy")
Log ("LOG=" + $Log)
Write-Host ""
Write-Host "Copy this block back (no secrets):"
Write-Host "CUTOVER_OK"
Write-Host ("HEAD=" + $head)
Write-Host ("VERSION=" + $ver.commit)
Write-Host "WEB=healthy"
Write-Host ("LOG=" + $Log)

