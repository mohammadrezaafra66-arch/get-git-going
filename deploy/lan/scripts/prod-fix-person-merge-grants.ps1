#Requires -Version 5.1
<#
.SYNOPSIS
  Fix "permission denied for function _person_merge_repoint" on PRODUCTION :3000.

.DESCRIPTION
  Applies migration 558 (restore authenticated EXECUTE on merge helpers) via
  docker cp + psql -f (byte-safe). Registers the version in schema_migrations.
  Never: docker compose down -v. Never prints secrets. PowerShell 5.1 ASCII-safe.

.EXAMPLE
  cd C:\afrakala
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\prod-fix-person-merge-grants.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = "C:\afrakala",
  [string]$DbContainer = "afrakala-lan-db",
  [string]$DbName = "postgres",
  [string]$MigVersion = "20260916220000",
  [string]$MigFile = "supabase\migrations\20260916220000_558_person_merge_helper_grants.sql"
)

$ErrorActionPreference = "Stop"

function Fail([string]$Msg) {
  Write-Host "FAIL: $Msg" -ForegroundColor Red
  throw $Msg
}

function Log([string]$Msg) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format o), $Msg)
}

function Get-EnvLineValue([string]$Path, [string]$Key) {
  $line = (Select-String -LiteralPath $Path -Pattern ("^\s*" + [regex]::Escape($Key) + "\s*=") |
    Select-Object -First 1).Line
  if (-not $line) { return $null }
  return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

Write-Host "===== AFRAKALA_FIX_PERSON_MERGE_GRANTS_BEGIN ====="
Log ("RepoRoot=" + $RepoRoot)

if (-not (Test-Path -LiteralPath $RepoRoot)) { Fail ("Missing " + $RepoRoot) }
Set-Location -LiteralPath $RepoRoot

$EnvFile = Join-Path $RepoRoot "deploy\lan\.env.lan"
if (-not (Test-Path -LiteralPath $EnvFile)) { Fail ("Missing " + $EnvFile) }

$MigPath = Join-Path $RepoRoot $MigFile
if (-not (Test-Path -LiteralPath $MigPath)) { Fail ("Missing " + $MigPath) }

$pw = Get-EnvLineValue $EnvFile "POSTGRES_PASSWORD"
if (-not $pw) { Fail "POSTGRES_PASSWORD missing in .env.lan" }

$running = docker ps --filter ("name=" + $DbContainer) --format "{{.Names}}"
if (-not ($running -match [regex]::Escape($DbContainer))) {
  Fail ("DB container not running: " + $DbContainer)
}

$have = docker exec -e PGPASSWORD=$pw $DbContainer `
  psql -U supabase_admin -d $DbName -t -A -c `
  ("SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '" + $MigVersion + "';")
if (($have | Out-String).Trim() -eq "1") {
  Log ("ALREADY_APPLIED version=" + $MigVersion + " - re-running SQL (idempotent GRANT)")
}

$RemoteSql = "/tmp/558_person_merge_helper_grants.sql"
Log ("STEP docker cp -> " + $RemoteSql)
docker cp $MigPath ($DbContainer + ":" + $RemoteSql)
if ($LASTEXITCODE -ne 0) { Fail "docker cp failed" }

Log "STEP apply migration 558"
docker exec -e PGPASSWORD=$pw $DbContainer `
  psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 `
  -c "SET client_encoding TO 'UTF8';" `
  -f $RemoteSql
if ($LASTEXITCODE -ne 0) { Fail "psql -f 558 failed" }

docker exec -e PGPASSWORD=$pw $DbContainer sh -lc ("rm -f " + $RemoteSql) | Out-Null

Log "STEP ledger insert"
docker exec -e PGPASSWORD=$pw $DbContainer `
  psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 -c `
  ("INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('" + $MigVersion + "') ON CONFLICT DO NOTHING;")
if ($LASTEXITCODE -ne 0) { Fail "ledger insert failed" }

Log "STEP probe privileges"
# Single-line SQL only: PowerShell 5.1 mishandles here-strings with ||.
$probeSql = "SELECT has_function_privilege('authenticated','public._person_merge_repoint(text,text,uuid,uuid)'::regprocedure,'EXECUTE')::text || chr(124) || has_function_privilege('authenticated','public._person_merge_count_refs(text,text,uuid)'::regprocedure,'EXECUTE')::text || chr(124) || has_function_privilege('anon','public._person_merge_repoint(text,text,uuid,uuid)'::regprocedure,'EXECUTE')::text;"
$probe = docker exec -e PGPASSWORD=$pw $DbContainer `
  psql -U supabase_admin -d $DbName -t -A -c $probeSql
if ($LASTEXITCODE -ne 0) { Fail "probe failed" }
$probeText = ($probe | Out-String).Trim()
Log ("PROBE_auth_repoint|auth_count|anon_repoint=" + $probeText)
if ($probeText -ne "true|true|false") {
  Fail ("Unexpected privilege probe: " + $probeText)
}

Write-Host "===== AFRAKALA_FIX_PERSON_MERGE_GRANTS_END ====="
Write-Host "FIX_OK: retry merge on http://192.168.170.10:3000/persons/merge (Ctrl+F5 first)"
