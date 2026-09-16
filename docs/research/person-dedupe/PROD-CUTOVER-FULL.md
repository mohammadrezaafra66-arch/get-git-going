# AfraKala — FULL production cutover (test :3100 -> prod :3000)
# Target: 192.168.170.10 | Live tree: C:\afrakala | Port: 3000 | DB: postgres @ afrakala-lan-db
#
# Scope: EVERYTHING from LAN test (ticket, sales-desk, ring/CEL, persons, sidebar pin,
# pricing worker, windowless tasks, Torob Ops Path B). Issabel CDR keys already present in live .env.lan.
# Torob transfer details: docs/torob-ops/PROD-TRANSFER.md
#
# Admin PowerShell on PRODUCTION. Run blocks IN ORDER. Stop on FAIL.
# Never paste passwords into chat.
# Never: docker compose down -v

## Discovery lock (2026-09-16)

- LIVE_CLONE = C:\afrakala
- WEB_PORT = 3000
- PROD_DB = postgres (container afrakala-lan-db)
- Running image SHA was a935be0b; clone HEAD already feature/sales-desk @ 22277e48
- DO NOT rebuild from C:\AfraKalaServer\get-git-going01lan
- Ledger probe in discovery used the WRONG .env first — always use C:\afrakala\deploy\lan\.env.lan

---

## STEP 0 — Owner gate (type this once)

```powershell
# Type exactly, then continue:
Write-Host "MIGRATE_PROD_APPROVED = YES I approve migrations on production DB"
```

---

## STEP 1 — Code on live tree

```powershell
cd C:\afrakala
git fetch origin
git checkout feature/sales-desk
git pull origin feature/sales-desk
git rev-parse --short HEAD
git status -sb
```

Expected short SHA at or after `b6b298b0` (sales-desk + Torob Ops Path B + quick-price flag + rules dropdown fix). `.env.lan` dirty is OK.
Confirm: `Test-Path .\src\routes\_app.torob-ops.tsx` and migrations `20260916190000_555_torob_ops_path_b.sql` + `20260916200000_556_sale_price_type_quick_price_only.sql`.

---

## STEP 2 — Env presence only (no secret print)

```powershell
$EnvFile = "C:\afrakala\deploy\lan\.env.lan"
Select-String -Path $EnvFile -Pattern '^(APP_PORT|ISSABEL_|PRICING_WORKER_TOKEN)=' |
  ForEach-Object { ($_.Line -split '=',2)[0] }

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
# Do NOT overwrite ISSABEL_* — discovery already showed them present.
```

---

## STEP 3 — Backup DB (before any migration)

```powershell
$EnvFile = "C:\afrakala\deploy\lan\.env.lan"
$line = (Select-String -Path $EnvFile -Pattern '^\s*POSTGRES_PASSWORD\s*=' | Select-Object -First 1).Line
$pw = ($line -split '=',2)[1].Trim().Trim('"').Trim("'")
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bakDir = "C:\afrakala\backups"
New-Item -ItemType Directory -Force -Path $bakDir | Out-Null
$remote = "/tmp/prod-pre-cutover-$stamp.dump"
$local = Join-Path $bakDir "prod-pre-cutover-$stamp.dump"

docker exec -e PGPASSWORD=$pw afrakala-lan-db pg_dump -U postgres -d postgres -Fc -f $remote
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
# Prefer stdin copy if docker cp fails on this host:
docker cp "afrakala-lan-db:$remote" $local
if (-not (Test-Path $local)) { throw "backup file missing: $local" }
Get-Item $local | Format-List FullName, Length, LastWriteTime
Write-Host "BACKUP_OK $local"
```

---

## STEP 4 — Apply missing migrations (CORRECT .env)

```powershell
$EnvFile = "C:\afrakala\deploy\lan\.env.lan"
$line = (Select-String -Path $EnvFile -Pattern '^\s*POSTGRES_PASSWORD\s*=' | Select-Object -First 1).Line
$pw = ($line -split '=',2)[1].Trim().Trim('"').Trim("'")
$Db = "afrakala-lan-db"
$DbName = "postgres"
$MigDir = "C:\afrakala\supabase\migrations"

# What is already applied
docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -c @"
SELECT version FROM supabase_migrations.schema_migrations
WHERE version >= '20260915000000'
ORDER BY 1;
"@

$need = @(
  # Ticket / Calm Mind
  "20260915233000",
  "20260916001500",
  "20260916140000",
  "20260916150000",
  # Sales desk
  "20260916030000",
  "20260916031000",
  "20260916032000",
  "20260916033000",
  # Person identity / cleanup
  "20260916120000",
  "20260916121000",
  "20260916122000",
  "20260916123000",
  # Live ring + pricing enqueue
  "20260916160000",
  "20260916161000",
  "20260916162000",
  "20260916170000",
  # Torob Ops Path B (555)
  "20260916190000",
  # Quick-price-only sale price types (556)
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
  # Byte-safe: Node Buffer path if available; else Get-Content -Raw (UTF8)
  $sql = [System.IO.File]::ReadAllText($file.FullName)
  $sql | docker exec -i -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 --single-transaction
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($file.Name)" }
  docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$v') ON CONFLICT DO NOTHING;"
  Write-Host "OK $v"
}

docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -c "NOTIFY pgrst, 'reload schema';"
docker restart afrakala-lan-rest
Start-Sleep 5

docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -c @"
SELECT to_regclass('public.work_items') AS work_items,
       to_regclass('public.sales_interactions') AS sales_interactions,
       to_regclass('public.call_ring_events') AS call_ring_events,
       to_regclass('public.torob_ops_credentials') AS torob_ops_credentials,
       to_regclass('public.torob_ops_findings') AS torob_ops_findings;
SELECT public.person_detect_merge_candidates(NULL);
"@
```

If `person_detect_merge_candidates` errors, stop and send the error text (no secrets).

---

## STEP 5 — Rebuild web ONLY

```powershell
cd C:\afrakala
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format o)
Write-Host "Building GIT_SHA=$env:GIT_SHA"
docker compose --env-file deploy\lan\.env.lan -f deploy\lan\docker-compose.yml up -d --no-deps --build web
```

Wait healthy, then verify (single-quoted docker formats for PowerShell 5.1):

```powershell
docker ps --filter name=afrakala-lan-web --format '{{.Status}}'
Invoke-RestMethod http://127.0.0.1:3000/api/version | Format-List
docker inspect afrakala-lan-web --format '{{range .Config.Env}}{{println .}}{{end}}' |
  Select-String '^(APP_GIT_SHA|ISSABEL_CDR_HOST|ISSABEL_IMPORT_WORKER_TOKEN|PRICING_WORKER_TOKEN)='
```

Must match: `commit` == `git rev-parse --short HEAD`, and ISSABEL/PRICING keys present (do not paste values).

---

## STEP 6 — Windowless host tasks

```powershell
cd C:\afrakala
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\register-issabel-import-live-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\register-issabel-cel-ring-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\register-pricing-worker-live-task.ps1
if (Test-Path deploy\lan\scripts\hide-afrakala-live-tasks.ps1) {
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\hide-afrakala-live-tasks.ps1
}

Get-ScheduledTask | Where-Object { $_.TaskName -match 'AfraKala-(Issabel|Pricing)' } | ForEach-Object {
  $a = $_.Actions[0]
  [PSCustomObject]@{ Name=$_.TaskName; State=$_.State; Engine=(Split-Path $a.Execute -Leaf); Args=$a.Arguments }
} | Format-List

Start-ScheduledTask -TaskName AfraKala-IssabelImport-Live -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName AfraKala-IssabelCelRing -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName AfraKala-PricingWorker-Live -ErrorAction SilentlyContinue
Start-Sleep 8
Get-Content C:\afrakala\deploy\lan\logs\issabel-import-live.log -Tail 5 -ErrorAction SilentlyContinue
Get-Content C:\afrakala\deploy\lan\logs\issabel-cel-ring.log -Tail 5 -ErrorAction SilentlyContinue
Get-Content C:\afrakala\deploy\lan\logs\pricing-worker-live.log -Tail 5 -ErrorAction SilentlyContinue
```

---

## STEP 7 — Smoke

```powershell
foreach ($p in @(
  '/operations/sales-desk',
  '/operations/work',
  '/operations/call-activity',
  '/admin/persons-cleanup',
  '/admin/call-extensions',
  '/sales/search',
  '/pricing/quick-price',
  '/pricing/sale-price-types',
  '/torob-ops',
  '/torob-ops/runs',
  '/torob-ops/findings',
  '/admin/torob-ops-access'
)) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ("http://127.0.0.1:3000" + $p) -MaximumRedirection 0
    Write-Host "$p -> $($r.StatusCode)"
  } catch {
    if ($_.Exception.Response) { Write-Host "$p -> $($_.Exception.Response.StatusCode.value__)" }
    else { Write-Host "$p -> FAIL $($_.Exception.Message)" }
  }
}
```

Manual:
1. http://192.168.170.10:3000 — Ctrl+F5
2. Sidebar: **تیکت** pin under quick sales search + **میز فروش**
3. /operations/work — intro + Jalali due
4. /admin/call-extensions — map extensions if empty
5. Test call for popup (after CEL log looks healthy)
6. /admin/torob-ops-access — set module password for owner; /torob-ops unlock form works
7. See also `docs/torob-ops/PROD-TRANSFER.md`

---

## Reply after success (no secrets)

```
CUTOVER_OK
HEAD=<short sha>
VERSION=<commit from /api/version>
WEB=healthy
WORK=200
SALES_DESK=200
TOROB_OPS=200
IMPORT_LOG=<ok or short error without token>
CEL=<ok or short error>
PINS=yes
```
