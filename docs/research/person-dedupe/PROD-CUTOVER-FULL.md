# AfraKala — FULL production cutover guide (everything we built on test)
# Target machine: 192.168.170.10
# Live tree: C:\afrakala   |  Web port: 3000   |  DB: postgres @ afrakala-lan-db
#
# Decision locked by owner: transfer EVERYTHING (sales-desk, ticket, ring/CEL,
# sidebar pin, pricing worker, windowless tasks). Issabel CDR+CEL in this cutover.
#
# Open PowerShell as Administrator on the PRODUCTION laptop.
# Run the blocks IN ORDER. Stop if any block prints FAIL / Error.
# Never paste passwords into chat.

## 0) One-time decisions already known from discovery

- LIVE_CLONE = C:\afrakala
- WEB_PORT = 3000
- PROD_DB = postgres
- Code tip = branch feature/sales-desk (includes sidebar pin; main is missing pin PR #454)
- Do NOT use C:\AfraKalaServer\get-git-going01lan for the web rebuild

---

## STEP 1 — Code pull (feature/sales-desk)

```powershell
cd C:\afrakala
git fetch origin
git checkout feature/sales-desk
git pull origin feature/sales-desk
git rev-parse --short HEAD
git status -sb
```

Expected: clean (or only local .env.lan dirty — that is OK; .env.lan is gitignored).
Remember the short SHA printed — you will match it after rebuild.

---

## STEP 2 — Tokens + Issabel keys in .env.lan (secrets stay on the machine)

```powershell
$EnvFile = "C:\afrakala\deploy\lan\.env.lan"

# Generate two tokens (print once, then they are appended — do not send to chat)
$importToken = -join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
$pricingToken = -join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
Write-Host "IMPORT_TOKEN_LEN=$($importToken.Length) PRICING_TOKEN_LEN=$($pricingToken.Length)"

# IMPORTANT: set the real Issabel MySQL password for the PROD RO user below.
# If the PBX user for 192.168.170.10 is not created yet, create it first (STEP 2b),
# then re-run this block with the real password.
$cdrUser = "afrakala_cdr_ro_prod"
$cdrPass = "REPLACE_WITH_REAL_PBX_MYSQL_PASSWORD"
$cdrHost = "192.168.170.252"
$cdrDb   = "asteriskcdrdb"

if ($cdrPass -eq "REPLACE_WITH_REAL_PBX_MYSQL_PASSWORD") {
  Write-Host "STOP: set `$cdrPass to the real MySQL password before continuing." -ForegroundColor Red
  return
}

# Append only if keys missing (idempotent-ish)
$raw = Get-Content $EnvFile -Raw
$append = @()
function Need([string]$k) { return ($raw -notmatch ("(?m)^\s*" + [regex]::Escape($k) + "\s*=")) }

if (Need "ISSABEL_CDR_HOST") { $append += "ISSABEL_CDR_HOST=$cdrHost" }
if (Need "ISSABEL_CDR_PORT") { $append += "ISSABEL_CDR_PORT=3306" }
if (Need "ISSABEL_CDR_USER") { $append += "ISSABEL_CDR_USER=$cdrUser" }
if (Need "ISSABEL_CDR_PASSWORD") { $append += "ISSABEL_CDR_PASSWORD=$cdrPass" }
if (Need "ISSABEL_CDR_DB") { $append += "ISSABEL_CDR_DB=$cdrDb" }
if (Need "ISSABEL_IMPORT_WORKER_TOKEN") { $append += "ISSABEL_IMPORT_WORKER_TOKEN=$importToken" }
if (Need "PRICING_WORKER_TOKEN") { $append += "PRICING_WORKER_TOKEN=$pricingToken" }
if (Need "APP_PORT") { $append += "APP_PORT=3000" }

if ($append.Count -gt 0) {
  Add-Content -Path $EnvFile -Value ""
  Add-Content -Path $EnvFile -Value "# --- cutover $(Get-Date -Format o) ---"
  Add-Content -Path $EnvFile -Value ($append -join "`r`n")
  Write-Host "Appended $($append.Count) keys to .env.lan"
} else {
  Write-Host "All cutover keys already present in .env.lan"
}

# Presence check only (no values)
Select-String -Path $EnvFile -Pattern '^(ISSABEL_|PRICING_WORKER_TOKEN|APP_PORT)=' |
  ForEach-Object { ($_.Line -split '=',2)[0] }
```

### STEP 2b — On Issabel PBX (192.168.170.252) if prod MySQL user missing

Run as PBX admin (not in chat with real password):

```sql
CREATE USER 'afrakala_cdr_ro_prod'@'192.168.170.10'
  IDENTIFIED BY '<strong-password>';
GRANT SELECT ON asteriskcdrdb.* TO 'afrakala_cdr_ro_prod'@'192.168.170.10';
FLUSH PRIVILEGES;
```

Firewall on PBX:

```bash
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.170.10/32" port port="3306" protocol="tcp" accept'
firewall-cmd --reload
```

---

## STEP 3 — Migration ledger + apply missing (DB postgres)

```powershell
$EnvFile = "C:\afrakala\deploy\lan\.env.lan"
$line = (Select-String -Path $EnvFile -Pattern '^\s*POSTGRES_PASSWORD\s*=' | Select-Object -First 1).Line
$pw = ($line -split '=',2)[1].Trim().Trim('"').Trim("'")
$Db = "afrakala-lan-db"
$DbName = "postgres"
$MigDir = "C:\afrakala\supabase\migrations"

# Show what is already applied
docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '20260916000000' ORDER BY 1;"

$need = @(
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
  "20260916170000"
)
# Optional Calm Mind work tables if you want ticket taxonomies extras too:
# "20260916140000","20260916150000"  (work_*) — only if files exist and not applied

$have = docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -t -A -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '20260916000000';"
$haveSet = @{}
$have -split "`n" | ForEach-Object { if ($_.Trim()) { $haveSet[$_.Trim()] = $true } }

foreach ($v in $need) {
  if ($haveSet.ContainsKey($v)) { Write-Host "SKIP $v (already in ledger)"; continue }
  $file = Get-ChildItem -Path $MigDir -Filter ($v + "_*.sql") | Select-Object -First 1
  if (-not $file) { Write-Host "MISSING FILE for $v"; continue }
  Write-Host "APPLY $($file.Name) ..."
  Get-Content -LiteralPath $file.FullName -Raw | docker exec -i -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 --single-transaction
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($file.Name)" }
  docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$v') ON CONFLICT DO NOTHING;"
  Write-Host "OK $v"
}

docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -c "SELECT public.person_detect_merge_candidates(NULL); NOTIFY pgrst, 'reload schema';"
docker exec -e PGPASSWORD=$pw $Db psql -U supabase_admin -d $DbName -c "SELECT to_regclass('public.call_ring_events'), to_regclass('public.sales_interactions');"
```

If `person_detect_merge_candidates` errors because 549 not applied yet, re-check ledger — do not ignore failures.

---

## STEP 4 — Rebuild web ONLY (never down -v)

```powershell
cd C:\afrakala
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format o)
Write-Host "Building GIT_SHA=$env:GIT_SHA"
docker compose --env-file deploy\lan\.env.lan -f deploy\lan\docker-compose.yml up -d --no-deps --build web
```

Wait until healthy, then:

```powershell
docker ps --filter name=afrakala-lan-web --format "{{.Status}}"
Invoke-RestMethod http://127.0.0.1:3000/api/version | Format-List
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA|ISSABEL_CDR_HOST|ISSABEL_IMPORT_WORKER_TOKEN|PRICING_WORKER_TOKEN"
```

Checks:
- Status contains healthy
- commit matches git rev-parse --short HEAD
- ISSABEL_CDR_HOST and tokens show as KEY=... (values present; do not paste values into chat)

---

## STEP 5 — Windowless host tasks (Import / CEL / Pricing)

```powershell
cd C:\afrakala
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\register-issabel-import-live-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\register-issabel-cel-ring-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\register-pricing-worker-live-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\hide-afrakala-live-tasks.ps1
```

Verify:

```powershell
Get-ScheduledTask -TaskName 'AfraKala-*' | ForEach-Object {
  $a = $_.Actions[0]
  [PSCustomObject]@{ Name=$_.TaskName; State=$_.State; Engine=Split-Path $a.Execute -Leaf; Args=$a.Arguments }
} | Format-List
```

Engine should be `wscript.exe` (windowless).

Kick once:

```powershell
Start-ScheduledTask AfraKala-IssabelImport-Live
Start-ScheduledTask AfraKala-IssabelCelRing
Start-ScheduledTask AfraKala-PricingWorker-Live
Start-Sleep 5
Get-Content C:\afrakala\deploy\lan\logs\issabel-import-live.log -Tail 3 -ErrorAction SilentlyContinue
Get-Content C:\afrakala\deploy\lan\logs\issabel-cel-ring.log -Tail 3 -ErrorAction SilentlyContinue
Get-Content C:\afrakala\deploy\lan\logs\pricing-worker-live.log -Tail 3 -ErrorAction SilentlyContinue
```

---

## STEP 6 — Smoke (UI + data)

```powershell
foreach ($p in @(
  '/operations/sales-desk',
  '/operations/work',
  '/operations/call-activity',
  '/admin/persons-cleanup',
  '/admin/call-extensions'
)) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 -Uri ("http://127.0.0.1:3000" + $p)
    Write-Host "$p -> $($r.StatusCode)"
  } catch {
    Write-Host "$p -> FAIL $($_.Exception.Message)"
  }
}

$EnvFile = "C:\afrakala\deploy\lan\.env.lan"
$line = (Select-String -Path $EnvFile -Pattern '^\s*POSTGRES_PASSWORD\s*=' | Select-Object -First 1).Line
$pw = ($line -split '=',2)[1].Trim().Trim('"').Trim("'")
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c "SELECT count(*) AS ext FROM call_log_extensions; SELECT count(*) AS rings FROM call_ring_events; SELECT count(*) AS calls FROM call_logs;"
```

Manual UI:
1. Open http://192.168.170.10:3000 (or :80)
2. Hard refresh (Ctrl+F5)
3. Sidebar: pins **میز فروش** and **تیکت**
4. Map extensions in /admin/call-extensions if empty
5. Place a test call — popup should appear within ~2s after CEL is healthy

---

## STEP 7 — Do NOT

- docker compose down -v
- Copy the test PC Docker image
- Commit .env.lan
- Point AMI permit only at .8 (if you add AMI later: permit 192.168.170.10)

---

## After success — reply with ONLY this (no secrets)

```
CUTOVER_OK
HEAD=<short sha>
VERSION=<commit from /api/version>
WEB=healthy
IMPORT_LOG=HTTP 200 or error text without token
CEL=running or log line
PINS=yes/no
```
