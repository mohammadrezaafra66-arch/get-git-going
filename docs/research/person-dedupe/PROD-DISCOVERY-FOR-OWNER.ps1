# AfraKala — PRE-CUTOVER discovery on PRODUCTION (:3000)
# Run in Admin PowerShell on the PRODUCTION machine (192.168.170.10).
# Paste the entire OUTPUT block back to the agent. Do NOT paste passwords or tokens.

$ErrorActionPreference = "Continue"
Write-Host "===== AFRAKALA_PROD_DISCOVERY_BEGIN ====="

Write-Host "HOST=$(hostname)"
Write-Host "WHEN=$(Get-Date -Format o)"
Write-Host "PWD=$((Get-Location).Path)"

Write-Host "--- LIVE_TREE ---"
if (Test-Path C:\afrakala) {
  Set-Location C:\afrakala
  Write-Host "LIVE_CLONE=C:\afrakala"
  Write-Host "HEAD=$(git rev-parse --short HEAD 2>$null)"
  Write-Host "BRANCH=$(git rev-parse --abbrev-ref HEAD 2>$null)"
  Write-Host "STATUS_SB=$(git status -sb 2>$null | Select-Object -First 8 | Out-String)".Trim()
  Write-Host "HAS_TOROB_ROUTE=$(Test-Path .\src\routes\_app.torob-ops.tsx)"
  Write-Host "HAS_MIG_555=$(Test-Path .\supabase\migrations\20260916190000_555_torob_ops_path_b.sql)"
  Write-Host "HAS_MIG_556=$(Test-Path .\supabase\migrations\20260916200000_556_sale_price_type_quick_price_only.sql)"
} else {
  Write-Host "LIVE_CLONE=MISSING"
}

Write-Host "--- WEB ---"
docker ps --filter name=afrakala-lan-web --format '{{.Names}} {{.Status}} {{.Ports}}'
try {
  $v = Invoke-RestMethod http://127.0.0.1:3000/api/version -TimeoutSec 20
  Write-Host "VERSION_COMMIT=$($v.commit)"
  Write-Host "VERSION_ENV=$($v.environment)"
  Write-Host "VERSION_BUILD=$($v.buildTime)"
} catch {
  Write-Host "VERSION_FAIL=$($_.Exception.Message)"
}
docker inspect afrakala-lan-web --format '{{range .Config.Env}}{{println .}}{{end}}' 2>$null |
  Select-String '^(APP_GIT_SHA|APP_PORT|VITE_APP_ENV)=' |
  ForEach-Object { $_.Line }

Write-Host "--- ENV_KEYS_ONLY (no values) ---"
$EnvFile = "C:\afrakala\deploy\lan\.env.lan"
if (Test-Path $EnvFile) {
  Select-String -Path $EnvFile -Pattern '^(APP_PORT|POSTGRES_|ISSABEL_|PRICING_WORKER_TOKEN|SUPABASE_)=' |
    ForEach-Object { ($_.Line -split '=',2)[0] }
} else {
  Write-Host "ENV_FILE=MISSING"
}

Write-Host "--- DB_LEDGER_RECENT ---"
try {
  $line = (Select-String -Path $EnvFile -Pattern '^\s*POSTGRES_PASSWORD\s*=' | Select-Object -First 1).Line
  $pw = ($line -split '=',2)[1].Trim().Trim('"').Trim("'")
  docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -tAc @"
SELECT version FROM supabase_migrations.schema_migrations
WHERE version >= '20260915000000'
ORDER BY 1;
"@
  Write-Host "--- DB_OBJECTS ---"
  docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -tAc @"
SELECT to_regclass('public.work_items') AS work_items,
       to_regclass('public.sales_interactions') AS sales_interactions,
       to_regclass('public.call_ring_events') AS call_ring_events,
       to_regclass('public.torob_ops_credentials') AS torob_ops,
       (SELECT count(*)::text FROM information_schema.columns
          WHERE table_name='sale_price_types' AND column_name='is_quick_price_only') AS has_quick_col;
"@
} catch {
  Write-Host "DB_PROBE_FAIL=$($_.Exception.Message)"
}

Write-Host "--- TASKS ---"
Get-ScheduledTask -ErrorAction SilentlyContinue |
  Where-Object { $_.TaskName -match 'AfraKala-(Issabel|Pricing)' } |
  ForEach-Object { "$($_.TaskName)|$($_.State)" }

Write-Host "===== AFRAKALA_PROD_DISCOVERY_END ====="
Write-Host ""
Write-Host "Copy EVERYTHING between BEGIN and END (inclusive) back to the agent."
Write-Host "Then also type exactly this approval line in chat (when you are ready to migrate):"
Write-Host 'MIGRATE_PROD_APPROVED = YES I approve migrations on production DB'
