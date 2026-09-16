# =============================================================================
# AfraKala PRODUCTION READ-ONLY DISCOVERY (PowerShell 5.1 safe, ASCII-only)
# Run on PRODUCTION laptop. Does NOT change anything. Paste full output back.
# All docker --format templates use SINGLE-QUOTED strings.
# Signature: PowerShell 5.1 safe ASCII
# =============================================================================

$ErrorActionPreference = "Continue"

function Section([string]$t) {
  Write-Host ""
  Write-Host "========================================================================"
  Write-Host $t
  Write-Host "========================================================================"
}
function KV([string]$k, $v) {
  if ($null -eq $v) { $v = "" }
  Write-Host ("{0,-32} {1}" -f $k, $v)
}
function Run-Cmd([string]$File, [string[]]$ArgList) {
  try {
    & $File @ArgList 2>&1 | ForEach-Object { $_.ToString() }
  } catch {
    "ERR: $($_.Exception.Message)"
  }
}

Section "0) MACHINE / TIME"
KV "ComputerName" $env:COMPUTERNAME
KV "User" $env:USERNAME
KV "Now" (Get-Date -Format o)
KV "PSVersion" $PSVersionTable.PSVersion.ToString()

Section "1) CANDIDATE CLONE PATHS"
$candidates = @(
  "C:\afrakala",
  "C:\afrakala\app",
  "C:\AfraKalaServer\get-git-going01lan",
  "C:\AfraKalaServer\get-git-going01lan\app",
  "D:\afrakala",
  "D:\AfraKalaTest\app"
)
foreach ($p in $candidates) {
  # Skip roots whose drive letter is missing on this machine (e.g. D: on prod).
  if ($p -match '^[A-Za-z]:' -and -not (Test-Path -LiteralPath ($p.Substring(0, 2)))) {
    KV $p "exists=False git=False compose_lan=False (drive missing)"
    continue
  }
  $exists = Test-Path -LiteralPath $p
  $git = Test-Path -LiteralPath (Join-Path $p ".git")
  $compose = Test-Path -LiteralPath (Join-Path $p "deploy\lan\docker-compose.yml")
  KV $p ("exists=$exists git=$git compose_lan=$compose")
}

Section "2) RUNNING WEB CONTAINER"
$webName = "afrakala-lan-web"
$webLine = (Run-Cmd "docker" @("ps", "-a", "--filter", "name=$webName", "--format", '{{.Names}} {{.Status}} {{.Ports}}') | Select-Object -First 1)
KV "docker_ps_web" $webLine

$hasWeb = $false
if ($webLine -and ($webLine -notmatch "^ERR:") -and ($webLine.Trim().Length -gt 0) -and ($webLine -notmatch "Error")) {
  $hasWeb = $true
}
if ($hasWeb) {
  try {
    $raw = docker inspect $webName 2>$null
    $obj = $raw | ConvertFrom-Json
    if ($obj -is [System.Array]) { $c = $obj[0] } else { $c = $obj }
    $labels = $c.Config.Labels
    KV "compose_project" $labels.'com.docker.compose.project'
    KV "compose_working_dir" $labels.'com.docker.compose.project.working_dir'
    KV "compose_config_files" $labels.'com.docker.compose.project.config_files'
    KV "image" $c.Config.Image
    KV "started" $c.State.StartedAt
    Write-Host "--- ports ---"
    if ($c.NetworkSettings.Ports) {
      $c.NetworkSettings.Ports.PSObject.Properties | ForEach-Object {
        $map = $_.Value
        if ($map) {
          foreach ($m in $map) { Write-Host ($_.Name + " -> " + $m.HostIp + ":" + $m.HostPort) }
        } else {
          Write-Host ($_.Name + " -> (not published)")
        }
      }
    }
    Write-Host "--- env stamp (filtered; redact secrets before sharing) ---"
    $c.Config.Env | Where-Object {
      $_ -match "^(APP_GIT_SHA|GIT_SHA|BUILD_TIME|APP_PORT|SITE_URL|POSTGRES_DB|VITE_APP_ENV)="
    }
    Write-Host "--- env KEY presence only ---"
    foreach ($prefix in @("ISSABEL_", "PRICING_WORKER_TOKEN", "MARKETING_TASKS_WORKER_TOKEN", "SUPABASE_")) {
      $hits = @($c.Config.Env | Where-Object { $_ -like ($prefix + "*") })
      KV ("env_present." + $prefix.TrimEnd('_','=')) ("count=" + $hits.Count)
    }
  } catch {
    Write-Host ("inspect parse ERR: " + $_.Exception.Message)
  }
}

Section "3) /api/version on common ports"
foreach ($port in @(3100, 3000, 80)) {
  foreach ($hostAddr in @("127.0.0.1", "192.168.170.10")) {
    $url = "http://${hostAddr}:${port}/api/version"
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      $body = $r.Content
      if ($body.Length -gt 300) { $body = $body.Substring(0, 300) + "..." }
      KV $url $body
    } catch {
      KV $url ("FAIL: " + $_.Exception.Message)
    }
  }
}

Section "4) GIT STATE for each clone"
$gitRoots = New-Object System.Collections.Generic.List[string]
foreach ($p in $candidates) {
  if (Test-Path -LiteralPath (Join-Path $p ".git")) { [void]$gitRoots.Add($p) }
  $appGit = Join-Path $p "app"
  if (Test-Path -LiteralPath (Join-Path $appGit ".git")) { [void]$gitRoots.Add($appGit) }
}
$gitRoots = $gitRoots | Select-Object -Unique
if (-not $gitRoots) { Write-Host "No .git found." }
foreach ($root in $gitRoots) {
  Write-Host ""
  Write-Host ("--- git root: " + $root + " ---")
  Push-Location -LiteralPath $root
  try {
    KV "branch" ((git rev-parse --abbrev-ref HEAD 2>$null))
    KV "HEAD" ((git rev-parse --short HEAD 2>$null))
    KV "upstream" ((git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null))
    KV "status_sb" ((git status -sb 2>$null | Select-Object -First 1))
    Write-Host "recent:"
    git log -5 --oneline 2>$null
    Write-Host "remotes:"
    git remote -v 2>$null
    Write-Host "branches of interest:"
    git branch -vv 2>$null | Select-String "staging|main|sales-desk|^\*"
  } finally {
    Pop-Location
  }
}

Section "5) .env.lan KEY NAMES ONLY (no secret values)"
function Show-EnvKeyNames([string]$envPath) {
  if (-not (Test-Path -LiteralPath $envPath)) { KV $envPath "MISSING"; return }
  KV $envPath "present"
  $keys = @()
  Get-Content -LiteralPath $envPath -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') { $keys += $Matches[1] }
  }
  Write-Host ("keys: " + (($keys | Sort-Object) -join ", "))
  $want = @(
    "APP_PORT", "SITE_URL", "POSTGRES_DB", "POSTGRES_PASSWORD", "SUPABASE_URL",
    "ISSABEL_CDR_HOST", "ISSABEL_CDR_USER", "ISSABEL_CDR_PASSWORD", "ISSABEL_CDR_DB",
    "ISSABEL_IMPORT_WORKER_TOKEN", "ISSABEL_AMI_HOST", "ISSABEL_AMI_USER", "ISSABEL_AMI_SECRET",
    "PRICING_WORKER_TOKEN", "GIT_SHA"
  )
  foreach ($k in $want) {
    $hit = $keys -contains $k
    $nonEmpty = $false
    if ($hit) {
      $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match ("^\s*" + [regex]::Escape($k) + "\s*=") } | Select-Object -First 1
      if ($line) {
        $val = ($line -split "=", 2)[1]
        $nonEmpty = -not [string]::IsNullOrWhiteSpace($val)
      }
    }
    KV ("env." + $k) ("present=$hit nonEmpty=$nonEmpty")
  }
}
$envPaths = @(
  "C:\afrakala\deploy\lan\.env.lan",
  "C:\afrakala\app\deploy\lan\.env.lan",
  "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan",
  "C:\AfraKalaServer\get-git-going01lan\app\deploy\lan\.env.lan"
)
foreach ($e in $envPaths) { Show-EnvKeyNames $e }

Section "6) DOCKER containers (db/web)"
Run-Cmd "docker" @("ps", "-a", "--format", 'table {{.Names}}\t{{.Status}}\t{{.Ports}}')
Write-Host "--- POSTGRES_DB / POSTGRES_USER from db container (if present) ---"
foreach ($d in @("afrakala-lan-db", "afrakala-db", "supabase-db", "db")) {
  $names = Run-Cmd "docker" @("ps", "-a", "--format", '{{.Names}}')
  if ($names -contains $d) {
    KV "db_container" $d
    try {
      $elines = docker inspect $d 2>$null | ConvertFrom-Json
      if ($elines -is [System.Array]) { $dc = $elines[0] } else { $dc = $elines }
      $dc.Config.Env | Where-Object { $_ -match "^(POSTGRES_DB|POSTGRES_USER)=" }
    } catch {
      Write-Host ("db inspect ERR: " + $_.Exception.Message)
    }
  }
}

Section "7) MIGRATION LEDGER (read-only)"
function Try-Ledger([string]$dbContainer, [string]$dbName, [string]$envFile) {
  if (-not (Test-Path -LiteralPath $envFile)) { return $false }
  $pwLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*POSTGRES_PASSWORD\s*=' } | Select-Object -First 1
  if (-not $pwLine) { Write-Host "No POSTGRES_PASSWORD in $envFile"; return $false }
  $pw = ($pwLine -split "=", 2)[1].Trim().Trim('"').Trim("'")
  Write-Host "Trying ledger: container=$dbContainer db=$dbName envFile=$envFile"
  $sql = @"
SELECT current_database() AS db, current_user AS usr;
SELECT version FROM supabase_migrations.schema_migrations
WHERE version >= '20260916000000'
ORDER BY version;
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260915233000','20260916001500',
  '20260916030000','20260916031000','20260916032000','20260916033000',
  '20260916120000','20260916121000','20260916122000','20260916123000',
  '20260916140000','20260916150000',
  '20260916160000','20260916161000','20260916162000','20260916170000'
) ORDER BY version;
SELECT to_regclass('public.work_items') AS work_items;
SELECT to_regclass('public.call_ring_events') AS call_ring_events;
SELECT to_regclass('public.sales_interactions') AS sales_interactions;
SELECT count(*) AS call_logs FROM public.call_logs;
"@
  $tmp = Join-Path $env:TEMP "afrakala-ledger.sql"
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($tmp, $sql, $utf8)
  cmd /c "type `"$tmp`" | docker exec -i -e PGPASSWORD=$pw $dbContainer psql -U supabase_admin -d $dbName -v ON_ERROR_STOP=1" 2>&1 |
    ForEach-Object { $_.ToString() }
  return $true
}

$pairs = @(
  @{ c = "afrakala-lan-db"; d = "postgres"; e = "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan" },
  @{ c = "afrakala-lan-db"; d = "postgres"; e = "C:\afrakala\deploy\lan\.env.lan" },
  @{ c = "afrakala-lan-db"; d = "afrakala"; e = "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan" },
  @{ c = "afrakala-lan-db"; d = "afrakala"; e = "C:\afrakala\deploy\lan\.env.lan" },
  @{ c = "afrakala-lan-db"; d = "postgres"; e = "C:\AfraKalaServer\get-git-going01lan\app\deploy\lan\.env.lan" },
  @{ c = "afrakala-lan-db"; d = "postgres"; e = "C:\afrakala\app\deploy\lan\.env.lan" }
)
$tried = $false
foreach ($pair in $pairs) {
  if (Test-Path -LiteralPath $pair.e) {
    $null = Try-Ledger $pair.c $pair.d $pair.e
    $tried = $true
    break
  }
}
if (-not $tried) { Write-Host "Could not locate .env.lan for ledger query." }

Section "8) SCHEDULED TASKS"
Get-ScheduledTask -ErrorAction SilentlyContinue |
  Where-Object { $_.TaskName -match "Afra|Issabel|Pricing|afrakala" } |
  ForEach-Object {
    $a = $_.Actions | Select-Object -First 1
    Write-Host ("Task=" + $_.TaskName + " State=" + $_.State)
    Write-Host ("  Execute=" + $a.Execute)
    Write-Host ("  Arguments=" + $a.Arguments)
  }

Section "9) COMPOSE KEYWORD LINES"
function Grep-Compose([string]$compose) {
  if (-not (Test-Path -LiteralPath $compose)) { KV $compose "MISSING"; return }
  KV $compose "present"
  Select-String -LiteralPath $compose -Pattern "ISSABEL_|PRICING_WORKER_TOKEN|APP_PORT" |
    ForEach-Object { Write-Host ("L" + $_.LineNumber + ": " + $_.Line.Trim()) }
}
@(
  "C:\afrakala\deploy\lan\docker-compose.yml",
  "C:\afrakala\app\deploy\lan\docker-compose.yml",
  "C:\AfraKalaServer\get-git-going01lan\deploy\lan\docker-compose.yml",
  "C:\AfraKalaServer\get-git-going01lan\app\deploy\lan\docker-compose.yml"
) | ForEach-Object { Grep-Compose $_ }

Section "10) ANSWER SHEET (fill these in your reply)"
Write-Host "Q1 LIVE_CLONE_PATH       = (from compose_working_dir above)"
Write-Host "Q2 WEB_PORT              = (from /api/version that returned 200)"
Write-Host "Q3 PROD_DB_NAME          = postgres / afrakala / other"
Write-Host "Q4 FEATURES              = pricing-only  OR  full-main"
Write-Host "Q5 MIGRATE_PROD_APPROVED = YES I approve  OR  NO"
Write-Host "Q6 ISSABEL_LATER_OK      = yes leave Issabel for later / no need Issabel now"

Section "DONE - copy ALL output above and send it (redact passwords if any leaked)"
