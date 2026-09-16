# =============================================================================
# AfraKala — PRODUCTION READ-ONLY DISCOVERY (cutover questionnaire)
# PowerShell 5.1 safe: docker Go-templates use SINGLE-quoted strings only.
# Does NOT change files, git, docker, DB data, or tasks — only prints facts.
# Copy the ENTIRE output and send it back (no secret values are printed).
# =============================================================================

$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Section([string]$t) {
  Write-Host ""
  Write-Host ("=" * 72)
  Write-Host $t
  Write-Host ("=" * 72)
}
function KV([string]$k, $v) {
  if ($null -eq $v) { $v = "" }
  Write-Host ("{0,-28} {1}" -f $k, $v)
}

Section "0) MACHINE / TIME"
KV "ComputerName" $env:COMPUTERNAME
KV "User" $env:USERNAME
KV "Now" (Get-Date -Format o)
KV "PSVersion" $PSVersionTable.PSVersion

Section "1) CANDIDATE CLONE PATHS (existence)"
$candidates = @(
  "C:\afrakala",
  "C:\afrakala\app",
  "C:\AfraKalaServer\get-git-going01lan",
  "C:\AfraKalaServer\get-git-going01lan\app",
  "D:\afrakala",
  "D:\AfraKalaTest\app"
)
foreach ($p in $candidates) {
  $exists = Test-Path -LiteralPath $p
  $git = Test-Path -LiteralPath (Join-Path $p ".git")
  $compose = Test-Path -LiteralPath (Join-Path $p "deploy\lan\docker-compose.yml")
  $composeAlt = Test-Path -LiteralPath (Join-Path $p "docker-compose.yml")
  KV $p ("exists=$exists git=$git compose_lan=$compose compose_root=$composeAlt")
}

Section "2) RUNNING WEB CONTAINER — which tree is LIVE?"
$webName = "afrakala-lan-web"
$fmtWeb = '{{.Names}}|{{.Status}}|{{.Ports}}'
$web = docker ps -a --filter ("name=" + $webName) --format $fmtWeb 2>$null
KV "docker_ps_web" $web

if ($web) {
  $fmtProject = '{{index .Config.Labels "com.docker.compose.project"}}'
  $fmtWorkDir = '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
  $fmtConfig = '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
  $fmtImage = '{{.Config.Image}}'
  $fmtStarted = '{{.State.StartedAt}}'
  $fmtEnv = '{{range .Config.Env}}{{println .}}{{end}}'

  KV "compose_project" (docker inspect $webName --format $fmtProject 2>$null)
  KV "compose_working_dir" (docker inspect $webName --format $fmtWorkDir 2>$null)
  KV "compose_config_files" (docker inspect $webName --format $fmtConfig 2>$null)
  KV "image" (docker inspect $webName --format $fmtImage 2>$null)
  KV "started" (docker inspect $webName --format $fmtStarted 2>$null)
  Write-Host "--- ports / publish ---"
  docker port $webName 2>$null
  Write-Host "--- APP_/env stamp (names+values that are not secrets filtered) ---"
  docker inspect $webName --format $fmtEnv 2>$null |
    Select-String -Pattern "APP_GIT_SHA|GIT_SHA|BUILD_TIME|APP_PORT|SITE_URL|SUPABASE_URL|POSTGRES_DB|ISSABEL_|PRICING_|OLLAMA_|MARKETING_"
}

Section "3) /api/version on common ports"
foreach ($port in 3100, 3000, 80, 443) {
  foreach ($hostAddr in @("127.0.0.1", "192.168.170.10")) {
    $url = ("http://{0}:{1}/api/version" -f $hostAddr, $port)
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      KV $url $r.Content
    } catch {
      KV $url ("FAIL: " + $_.Exception.Message)
    }
  }
}

Section "4) GIT STATE for each existing clone root"
$gitRoots = New-Object System.Collections.Generic.List[string]
foreach ($p in $candidates) {
  if (Test-Path -LiteralPath (Join-Path $p ".git")) {
    [void]$gitRoots.Add($p)
  } elseif (Test-Path -LiteralPath (Join-Path $p "app\.git")) {
    [void]$gitRoots.Add((Join-Path $p "app"))
  }
}
$gitRoots = $gitRoots | Select-Object -Unique
if (-not $gitRoots) { Write-Host "No .git found in candidates." }
foreach ($root in $gitRoots) {
  Write-Host ""
  Write-Host ("--- git @ {0} ---" -f $root)
  Push-Location -LiteralPath $root
  try {
    KV "branch" (git rev-parse --abbrev-ref HEAD 2>$null)
    KV "HEAD" (git rev-parse --short HEAD 2>$null)
    KV "upstream" (git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null)
    KV "status_sb" ((git status -sb 2>$null | Select-Object -First 1) -join "")
    Write-Host "recent:"
    git log -5 --oneline 2>$null
    Write-Host "remotes:"
    git remote -v 2>$null
    Write-Host "branch -vv (staging/main/sales-desk):"
    git branch -vv 2>$null | Select-String "staging|main|sales-desk|^\*"
  } finally {
    Pop-Location
  }
}

Section "5) .env.lan KEY NAMES ONLY (no secret values)"
function Show-EnvKeyNames([string]$envPath) {
  if (-not (Test-Path -LiteralPath $envPath)) { KV $envPath "MISSING"; return }
  KV $envPath "present"
  $keys = Get-Content -LiteralPath $envPath -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*=' } |
    ForEach-Object { ($_ -split '=', 2)[0].Trim() }
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
      $line = Get-Content -LiteralPath $envPath |
        Where-Object { $_ -match ("^\s*" + [regex]::Escape($k) + "\s*=") } |
        Select-Object -First 1
      if ($line) {
        $val = ($line -split "=", 2)[1]
        $nonEmpty = -not [string]::IsNullOrWhiteSpace($val)
      }
    }
    KV ("env.$k") ("present=$hit nonEmpty=$nonEmpty")
  }
}
$envPaths = @(
  "C:\afrakala\deploy\lan\.env.lan",
  "C:\afrakala\app\deploy\lan\.env.lan",
  "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan",
  "C:\AfraKalaServer\get-git-going01lan\app\deploy\lan\.env.lan"
)
foreach ($e in $envPaths) { Show-EnvKeyNames $e }

Section "6) DOCKER DB container + database name hints"
$fmtTable = "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker ps -a --format $fmtTable 2>$null | Select-String -Pattern "db|postgres|afrakala|NAMES"
Write-Host "--- POSTGRES_DB from db container env (if any) ---"
$fmtNames = '{{.Names}}'
$fmtEnv = '{{range .Config.Env}}{{println .}}{{end}}'
$dbCandidates = @("afrakala-lan-db", "afrakala-db", "supabase-db", "db")
foreach ($d in $dbCandidates) {
  $exists = docker ps -a --format $fmtNames 2>$null | Where-Object { $_ -eq $d }
  if ($exists) {
    KV "db_container" $d
    docker inspect $d --format $fmtEnv 2>$null |
      Select-String -Pattern "POSTGRES_DB|POSTGRES_USER|POSTGRES_HOST"
  }
}

Section "7) MIGRATION LEDGER (read-only)"
function Try-Ledger([string]$dbContainer, [string]$dbName, [string]$envFile) {
  if (-not (Test-Path -LiteralPath $envFile)) { return $false }
  $pwLine = Get-Content -LiteralPath $envFile |
    Where-Object { $_ -match '^\s*POSTGRES_PASSWORD=' } |
    Select-Object -First 1
  if (-not $pwLine) { Write-Host ("No POSTGRES_PASSWORD in {0}" -f $envFile); return $false }
  $pw = ($pwLine -split "=", 2)[1].Trim().Trim('"').Trim("'")
  Write-Host ("Trying ledger: container={0} db={1} env={2}" -f $dbContainer, $dbName, $envFile)
  $sql = @"
SELECT current_database() AS db, current_user AS usr;
SELECT version FROM supabase_migrations.schema_migrations
WHERE version >= '20260916000000'
ORDER BY version;
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260916030000','20260916031000','20260916032000','20260916033000',
  '20260916120000','20260916121000','20260916122000','20260916123000',
  '20260916140000','20260916150000',
  '20260916160000','20260916161000','20260916162000','20260916170000'
) ORDER BY version;
SELECT to_regclass('public.call_ring_events') AS call_ring_events;
SELECT to_regclass('public.sales_interactions') AS sales_interactions;
SELECT count(*) AS call_logs FROM public.call_logs;
SELECT count(*) AS call_ring_events_n FROM public.call_ring_events;
SELECT count(*) AS call_log_extensions FROM public.call_log_extensions;
"@
  $sql | docker exec -i -e ("PGPASSWORD=" + $pw) $dbContainer psql -U supabase_admin -d $dbName -v ON_ERROR_STOP=1 2>&1 |
    ForEach-Object { $_.ToString() }
  return $true
}

$tried = $false
foreach ($pair in @(
  @{ c = "afrakala-lan-db"; d = "postgres"; e = "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan" },
  @{ c = "afrakala-lan-db"; d = "postgres"; e = "C:\afrakala\deploy\lan\.env.lan" },
  @{ c = "afrakala-lan-db"; d = "afrakala"; e = "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan" },
  @{ c = "afrakala-lan-db"; d = "afrakala"; e = "C:\afrakala\deploy\lan\.env.lan" },
  @{ c = "afrakala-lan-db"; d = "postgres"; e = "C:\AfraKalaServer\get-git-going01lan\app\deploy\lan\.env.lan" },
  @{ c = "afrakala-lan-db"; d = "postgres"; e = "C:\afrakala\app\deploy\lan\.env.lan" }
)) {
  if (Test-Path -LiteralPath $pair.e) {
    $ok = Try-Ledger $pair.c $pair.d $pair.e
    if ($ok) { $tried = $true; break }
  }
}
if (-not $tried) {
  Write-Host "Could not query ledger automatically — paste docker/db names manually if needed."
}

Section "8) SCHEDULED TASKS (Afra / Issabel / Pricing)"
Get-ScheduledTask -ErrorAction SilentlyContinue |
  Where-Object { $_.TaskName -match "Afra|Issabel|Pricing|afrakala" } |
  ForEach-Object {
    $a = $_.Actions | Select-Object -First 1
    KV $_.TaskName ("State={0} Execute={1}" -f $_.State, $a.Execute)
    if ($a.Arguments) { KV ("  args") $a.Arguments }
  }

Section "9) COMPOSE ISSABEL / PRICING BLOCK PRESENT?"
function Grep-Compose([string]$compose) {
  if (-not (Test-Path -LiteralPath $compose)) { KV $compose "MISSING"; return }
  KV $compose "present"
  Select-String -Path $compose -Pattern "ISSABEL_|PRICING_WORKER_TOKEN|APP_PORT" |
    ForEach-Object { Write-Host ("L{0}: {1}" -f $_.LineNumber, $_.Line.Trim()) }
}
@(
  "C:\afrakala\deploy\lan\docker-compose.yml",
  "C:\afrakala\app\deploy\lan\docker-compose.yml",
  "C:\AfraKalaServer\get-git-going01lan\deploy\lan\docker-compose.yml",
  "C:\AfraKalaServer\get-git-going01lan\app\deploy\lan\docker-compose.yml"
) | ForEach-Object { Grep-Compose $_ }

Section "10) ANSWER SHEET (fill from above — for the agent)"
Write-Host @"
Copy answers (or just send full log):

Q1 LIVE_CLONE_PATH          = (from compose_working_dir / config_files)
Q2 GIT_BRANCH_STRATEGY      = staging NOW  |  wait for main
Q3 MIGRATE_PROD_APPROVED    = YES I approve migrations on production DB  |  NO
Q3b PROD_DB_NAME            = postgres / afrakala / other:___
Q4 FEATURES_THIS_CUTOVER    = persons + sales-desk + ring + pricing + work   (edit)
Q5 ISSABEL_CREDS_READY      = have CDR  |  have AMI  |  neither / later
Q6 WEB_PORT                 = (from docker port /api/version that succeeded)
"@

Section "DONE — select all output above and paste back"
