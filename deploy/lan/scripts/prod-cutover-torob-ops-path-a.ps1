#Requires -Version 5.1
<#
.SYNOPSIS
  Promote Torob Ops Path A from healthy :3100/staging tip onto PRODUCTION :3000.

.DESCRIPTION
  Run on the PRODUCTION laptop only (C:\afrakala, APP_PORT=3000).
  - Pulls origin/staging
  - Applies migrations 555/557/558 + UTF-8 template fix as supabase_admin
  - Ensures TOROB_OPS_* secrets exist in .env.lan (generates if missing)
  - Forces auto_report_enabled=false and kill_switch=false after migrate
  - NEVER sets TOROB_OPS_SIMULATE_SUBMIT=1 on prod
  - Rebuilds web --no-deps --build
  - Smokes Path A routes + worker 401 without token

  Never: docker compose down -v
  PowerShell 5.1 ASCII-safe.

.PARAMETER SkipBackupConfirm
  If set, skips the interactive backup confirmation (still prints BACKUP reminder).

.EXAMPLE
  cd C:\afrakala
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\prod-cutover-torob-ops-path-a.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = "C:\afrakala",
  [int]$AppPort = 3000,
  [string]$ExpectedBranch = "staging",
  [string]$MinSha = "2d9a5b20",
  [switch]$SkipBackupConfirm
)

$ErrorActionPreference = "Stop"

function Fail([string]$Msg) {
  Write-Host ("FAIL: " + $Msg) -ForegroundColor Red
  throw $Msg
}

function Log([string]$Msg) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format o), $Msg)
}

function Get-EnvLineValue([string]$Path, [string]$Key) {
  $line = Select-String -Path $Path -Pattern ("^\s*{0}=(.*)$" -f [regex]::Escape($Key)) | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Matches.Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Ensure-EnvKey([string]$Path, [string]$Key, [string]$Value) {
  $existing = Get-EnvLineValue $Path $Key
  if ($null -ne $existing -and $existing -ne "") {
    Log ("ENV_OK " + $Key + " already set")
    return
  }
  Add-Content -Path $Path -Value ("{0}={1}" -f $Key, $Value)
  Log ("ENV_ADDED " + $Key)
}

function New-RandomToken([int]$Len = 48) {
  $chars = 48..57 + 65..90 + 97..122
  -join ($chars | Get-Random -Count $Len | ForEach-Object { [char]$_ })
}

Write-Host "===== AFRAKALA_TOROB_PATH_A_CUTOVER_BEGIN ====="
Log ("RepoRoot=" + $RepoRoot)
Log ("AppPort=" + $AppPort)

if (-not (Test-Path -LiteralPath $RepoRoot)) { Fail ("Missing " + $RepoRoot) }
Set-Location -LiteralPath $RepoRoot

$EnvFile = Join-Path $RepoRoot "deploy\lan\.env.lan"
$Compose = Join-Path $RepoRoot "deploy\lan\docker-compose.yml"
if (-not (Test-Path -LiteralPath $EnvFile)) { Fail ("Missing " + $EnvFile) }
if (-not (Test-Path -LiteralPath $Compose)) { Fail ("Missing " + $Compose) }

$appPortEnv = Get-EnvLineValue $EnvFile "APP_PORT"
if ($appPortEnv -and $appPortEnv -ne ([string]$AppPort)) {
  Write-Host ("WARN: APP_PORT in .env.lan is '" + $appPortEnv + "' (expected " + $AppPort + "). Not auto-changing.")
}

Write-Host ""
Write-Host "REQUIRED BEFORE CONTINUE:"
Write-Host "  1) Owner written approval for Path A code cutover (auto flag stays OFF)"
Write-Host "  2) Fresh DB backup (pg_dump -Fc) of production afrakala"
Write-Host "  3) :3100 acceptance green at tip >= $MinSha"
if (-not $SkipBackupConfirm) {
  $ans = Read-Host "Type YES if backup+approval done"
  if ($ans -ne "YES") { Fail "Aborted: backup/approval not confirmed" }
}

# --- git ---
Log "STEP git fetch/checkout/pull"
git fetch origin 2>&1 | Out-Host
git checkout $ExpectedBranch 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Fail ("checkout " + $ExpectedBranch + " failed") }
git pull origin $ExpectedBranch 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "git pull failed" }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$head = (git rev-parse --short HEAD).Trim()
Log ("BRANCH=" + $branch)
Log ("HEAD=" + $head)
if ($branch -ne $ExpectedBranch) { Fail ("Expected " + $ExpectedBranch) }

$required = @(
  "src\routes\_app.torob-ops.tsx",
  "src\routes\_app.torob-ops_.settings.tsx",
  "src\routes\_app.torob-ops_.accounts.tsx",
  "src\routes\_app.torob-ops_.shops.tsx",
  "src\routes\api\public\hooks\process-torob-ops-report-queue.ts",
  "supabase\migrations\20260916190000_555_torob_ops_path_b.sql",
  "supabase\migrations\20260916210000_557_torob_ops_path_a.sql",
  "supabase\migrations\20260916220000_558_torob_ops_correlation.sql",
  "docs\verification\fix-torob-ops-template-utf8.sql",
  "docs\verification\557-remediate-app-role.sql"
)
foreach ($rel in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $rel))) {
    Fail ("Missing required path: " + $rel)
  }
}
Log "GIT_TREE_OK"

# --- env secrets (prod-safe) ---
Log "STEP ensure TOROB_OPS env keys"
Ensure-EnvKey $EnvFile "TOROB_OPS_WORKER_TOKEN" (New-RandomToken 48)
Ensure-EnvKey $EnvFile "TOROB_OPS_ACCOUNT_SECRET" (New-RandomToken 48)
# Explicitly do NOT enable simulate on prod
$sim = Get-EnvLineValue $EnvFile "TOROB_OPS_SIMULATE_SUBMIT"
if ($sim -eq "1") {
  Fail "TOROB_OPS_SIMULATE_SUBMIT=1 is set in prod .env.lan — remove/set 0 before cutover"
}

$dbName = Get-EnvLineValue $EnvFile "POSTGRES_DB"
if (-not $dbName) { $dbName = "afrakala" }
$pgPass = Get-EnvLineValue $EnvFile "POSTGRES_PASSWORD"
if (-not $pgPass) { Fail "POSTGRES_PASSWORD missing" }
$DbContainer = "afrakala-lan-db"

# --- migrations ---
Log "STEP apply Path A/B migrations on DB=$dbName as supabase_admin"
$migFiles = @(
  "supabase\migrations\20260916190000_555_torob_ops_path_b.sql",
  "supabase\migrations\20260916210000_557_torob_ops_path_a.sql",
  "docs\verification\557-remediate-app-role.sql",
  "supabase\migrations\20260916220000_558_torob_ops_correlation.sql",
  "docs\verification\fix-torob-ops-template-utf8.sql"
)
foreach ($rel in $migFiles) {
  $local = Join-Path $RepoRoot $rel
  $remote = "/tmp/" + [IO.Path]::GetFileName($rel)
  Log ("MIG " + $rel)
  docker cp $local ($DbContainer + ":" + $remote)
  if ($LASTEXITCODE -ne 0) { Fail ("docker cp failed for " + $rel) }
  docker exec -e ("PGPASSWORD=" + $pgPass) $DbContainer `
    psql -U supabase_admin -d $dbName -v ON_ERROR_STOP=1 -f $remote 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail ("psql failed for " + $rel) }
}

docker exec -e ("PGPASSWORD=" + $pgPass) $DbContainer `
  psql -U supabase_admin -d $dbName -c "NOTIFY pgrst, 'reload schema';" 2>&1 | Out-Host

# Force safe flags
docker exec -e ("PGPASSWORD=" + $pgPass) $DbContainer `
  psql -U supabase_admin -d $dbName -c "UPDATE public.torob_ops_settings SET auto_report_enabled=false, kill_switch=false WHERE id=1;" 2>&1 | Out-Host

$tmplName = (docker exec -e ("PGPASSWORD=" + $pgPass) $DbContainer `
  psql -U supabase_admin -d $dbName -tAc "SELECT name FROM torob_ops_report_templates WHERE is_default LIMIT 1;").Trim()
Log ("TEMPLATE_NAME=" + $tmplName)
if ($tmplName -notmatch "[\u0600-\u06FF]") {
  # Fallback ASCII check: reject pure question marks
  if ($tmplName -match "^\?+$" -or $tmplName -like "*???*") {
    Fail "Template name still corrupted; re-run fix-torob-ops-template-utf8.sql"
  }
}
Log "DB_OK"

# --- rebuild web ---
Log "STEP rebuild web"
$env:GIT_SHA = $head
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file $EnvFile -f $Compose up -d --no-deps --build web 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "web build/up failed" }

$ok = $false
for ($i = 1; $i -le 48; $i++) {
  Start-Sleep -Seconds 5
  $st = docker ps --filter name=afrakala-lan-web --format "{{.Status}}"
  Log ("web try " + $i + " : " + $st)
  if ($st -match "healthy|Up") { $ok = $true; if ($st -match "healthy") { break } }
}
if (-not $ok) { Fail "web not up" }

$sha = (docker compose --env-file $EnvFile -f $Compose exec -T web printenv APP_GIT_SHA).Trim()
Log ("APP_GIT_SHA=" + $sha)
if ($sha -ne $head) { Fail ("SHA mismatch container=" + $sha + " head=" + $head) }

# --- smoke ---
Log "STEP smoke"
$base = "http://127.0.0.1:" + $AppPort
foreach ($p in @(
  "/torob-ops",
  "/torob-ops/runs",
  "/torob-ops/findings",
  "/torob-ops/shops",
  "/torob-ops/settings",
  "/torob-ops/accounts",
  "/admin/torob-ops-access"
)) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ($base + $p) -MaximumRedirection 0
    Log ("SMOKE " + $p + " -> " + $r.StatusCode)
  } catch {
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
      Log ("SMOKE " + $p + " -> " + $code)
      if ($code -ge 500) { Fail ("SMOKE 5xx on " + $p) }
    } else {
      Fail ("SMOKE " + $p + " FAIL " + $_.Exception.Message)
    }
  }
}

try {
  Invoke-WebRequest -UseBasicParsing -Method POST -TimeoutSec 20 `
    -Uri ($base + "/api/public/hooks/process-torob-ops-report-queue") `
    -ContentType "application/json" -Body "{}" | Out-Null
  Fail "worker without token unexpectedly succeeded"
} catch {
  if ($_.Exception.Response) {
    $code = [int]$_.Exception.Response.StatusCode
    if ($code -ne 401) { Fail ("worker expected 401 got " + $code) }
    Log "WORKER_NOAUTH -> 401 OK"
  } else {
    Fail ("worker probe failed: " + $_.Exception.Message)
  }
}

$auto = (docker exec -e ("PGPASSWORD=" + $pgPass) $DbContainer `
  psql -U supabase_admin -d $dbName -tAc "SELECT auto_report_enabled::text FROM torob_ops_settings WHERE id=1;").Trim()
if ($auto -ne "f" -and $auto -ne "false") { Fail ("auto_report_enabled must be false, got " + $auto) }
Log "AUTO_FLAG_OFF_OK"

Write-Host "===== AFRAKALA_TOROB_PATH_A_CUTOVER_END ====="
Write-Host ("CUTOVER_OK HEAD=" + $head + " APP_PORT=" + $AppPort + " auto_report=OFF")
Write-Host "Next: set module passwords at /admin/torob-ops-access ; keep auto flag OFF until Torob spike approval."
