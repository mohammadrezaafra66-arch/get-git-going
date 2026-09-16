# AfraKala FULL cutover on PRODUCTION (:3000)
# Live tree: C:\afrakala
# Requires prior chat approval: MIGRATE_PROD_APPROVED
# Never: docker compose down -v
# Never paste passwords into chat.

$ErrorActionPreference = "Stop"
Set-Location C:\afrakala

Write-Host "===== AFRAKALA FULL CUTOVER :3000 =====" -ForegroundColor Cyan
Write-Host "MIGRATE_PROD_APPROVED = YES I approve migrations on production DB"

# --- STEP 1: code ---
git fetch origin
git checkout feature/sales-desk
git pull origin feature/sales-desk
$head = (git rev-parse --short HEAD).Trim()
Write-Host "HEAD=$head"
Write-Host "TIP_NOTE=expected afa33768 or newer on feature/sales-desk"
if (-not (Test-Path .\src\routes\_app.torob-ops.tsx)) { throw "missing torob route" }
if (-not (Test-Path .\supabase\migrations\20260916190000_555_torob_ops_path_b.sql)) { throw "missing mig 555" }
if (-not (Test-Path .\supabase\migrations\20260916200000_556_sale_price_type_quick_price_only.sql)) { throw "missing mig 556" }

# --- STEP 2: env keys presence (no secret print) ---
$EnvFile = "C:\afrakala\deploy\lan\.env.lan"
if (-not (Test-Path $EnvFile)) { throw "missing $EnvFile" }
Select-String -Path $EnvFile -Pattern '^(APP_PORT|ISSABEL_|PRICING_WORKER_TOKEN)=' |
  ForEach-Object { ($_.Line -split '=', 2)[0] }
$raw = Get-Content $EnvFile -Raw
if ($raw -notmatch '(?m)^\s*PRICING_WORKER_TOKEN\s*=\s*\S') {
  $pricingToken = -join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
  Add-Content -Path $EnvFile -Value ""
  Add-Content -Path $EnvFile -Value "# cutover pricing token $(Get-Date -Format o)"
  Add-Content -Path $EnvFile -Value "PRICING_WORKER_TOKEN=$pricingToken"
  Write-Host "Appended PRICING_WORKER_TOKEN"
} else {
  Write-Host "PRICING_WORKER_TOKEN already present"
}

# --- STEP 3: backup ---
$line = (Select-String -Path $EnvFile -Pattern '^\s*POSTGRES_PASSWORD\s*=' | Select-Object -First 1).Line
if (-not $line) { throw "POSTGRES_PASSWORD not found in .env.lan" }
$pw = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bakDir = "C:\afrakala\backups"
New-Item -ItemType Directory -Force -Path $bakDir | Out-Null
$remote = "/tmp/prod-pre-cutover-$stamp.dump"
$local = Join-Path $bakDir "prod-pre-cutover-$stamp.dump"
docker exec -e PGPASSWORD=$pw afrakala-lan-db pg_dump -U postgres -d postgres -Fc -f $remote
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
docker cp "afrakala-lan-db:$remote" $local
if (-not (Test-Path $local)) { throw "backup file missing: $local" }
Get-Item $local | Format-List FullName, Length, LastWriteTime
Write-Host "BACKUP_OK $local"

# --- STEP 4: only missing migrations ---
$Db = "afrakala-lan-db"
$DbName = "postgres"
$MigDir = "C:\afrakala\supabase\migrations"
$need = @(
  "20260916150000",
  "20260916190000",
  "20260916200000"
)
$haveRaw = docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -t -A -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '20260915000000';"
$haveSet = @{}
$haveRaw -split "`n" | ForEach-Object { if ($_.Trim()) { $haveSet[$_.Trim()] = $true } }

foreach ($v in $need) {
  if ($haveSet.ContainsKey($v)) { Write-Host "SKIP $v"; continue }
  $file = Get-ChildItem -Path $MigDir -Filter ($v + "_*.sql") | Select-Object -First 1
  if (-not $file) { throw "MISSING FILE for $v in $MigDir" }
  Write-Host "APPLY $($file.Name) ..."
  # Byte-safe stdin into container (avoid PowerShell Get-Content pipe encoding damage on Persian SQL)
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "docker"
  $psi.Arguments = "exec -i -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 --single-transaction"
  $psi.RedirectStandardInput = $true
  $psi.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $p.StandardInput.Close()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { throw "Migration failed: $($file.Name) exit=$($p.ExitCode)" }
  docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$v') ON CONFLICT DO NOTHING;"
  Write-Host "OK $v"
}

docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -c "NOTIFY pgrst, 'reload schema';"
docker restart afrakala-lan-rest
Start-Sleep 5

$verify = docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -t -A -c @"
SELECT to_regclass('public.torob_ops_credentials')::text || '|' ||
       to_regclass('public.torob_ops_findings')::text || '|' ||
       (SELECT count(*)::text FROM information_schema.columns
        WHERE table_name='sale_price_types' AND column_name='is_quick_price_only');
"@
Write-Host "VERIFY_OBJECTS=$verify"

# --- STEP 5: rebuild web ---
$env:GIT_SHA = (git rev-parse --short HEAD).Trim()
$env:BUILD_TIME = (Get-Date -Format o)
Write-Host "Building GIT_SHA=$($env:GIT_SHA)"
docker compose --env-file deploy\lan\.env.lan -f deploy\lan\docker-compose.yml up -d --no-deps --build web
Start-Sleep 20
docker ps --filter name=afrakala-lan-web --format '{{.Status}}'
$ver = Invoke-RestMethod http://127.0.0.1:3000/api/version
$ver | Format-List
Write-Host "VERSION_COMMIT=$($ver.commit)"

# --- STEP 6: tasks ---
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\register-issabel-import-live-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\register-issabel-cel-ring-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\register-pricing-worker-live-task.ps1
if (Test-Path deploy\lan\scripts\hide-afrakala-live-tasks.ps1) {
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\hide-afrakala-live-tasks.ps1
}
Start-ScheduledTask -TaskName AfraKala-IssabelImport-Live -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName AfraKala-IssabelCelRing -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName AfraKala-PricingWorker-Live -ErrorAction SilentlyContinue

# --- STEP 7: smoke ---
foreach ($path in @(
  '/operations/sales-desk',
  '/operations/work',
  '/operations/call-activity',
  '/admin/persons-cleanup',
  '/sales/search',
  '/pricing/quick-price',
  '/pricing/sale-price-types',
  '/pricing/rules',
  '/torob-ops',
  '/admin/torob-ops-access'
)) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ("http://127.0.0.1:3000" + $path) -MaximumRedirection 0
    Write-Host "$path -> $($r.StatusCode)"
  } catch {
    if ($_.Exception.Response) { Write-Host "$path -> $($_.Exception.Response.StatusCode.value__)" }
    else { Write-Host "$path -> FAIL $($_.Exception.Message)" }
  }
}

Write-Host "===== CUTOVER_SCRIPT_DONE =====" -ForegroundColor Green
Write-Host "Reply in chat (no secrets):"
Write-Host "CUTOVER_OK"
Write-Host "HEAD=$head"
Write-Host "VERSION=$($ver.commit)"
Write-Host "BACKUP=$local"
Write-Host "VERIFY_OBJECTS=$verify"
Write-Host "WEB=$($ver.commit)"
