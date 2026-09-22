#Requires -Version 5.1
<#
.SYNOPSIS
  Fix ???? Persian text on /persons/merge details for PRODUCTION :3000.

.DESCRIPTION
  Root cause: migration 549 was applied through a non-UTF8 pipe, so
  person_detect_merge_candidates stored corrupted detail strings.

  This script:
    1) docker-cp's 549 SQL into afrakala-lan-db (byte-safe, no PS pipe)
    2) re-applies CREATE OR REPLACE (functions only; no schema_migrations change)
    3) runs person_detect_merge_candidates(NULL) to rewrite pending details
    4) probes that pending detail no longer looks like question marks
    5) NOTIFY pgrst

  Never: docker compose down -v
  Never prints secrets.
  PowerShell 5.1 ASCII-safe.

.EXAMPLE
  cd C:\afrakala
  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\lan\scripts\prod-fix-merge-detail-utf8.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = "C:\afrakala",
  [string]$DbContainer = "afrakala-lan-db",
  # Prod cutover uses database "postgres" (Supabase LAN layout).
  [string]$DbName = "postgres",
  [string]$MigFile = "supabase\migrations\20260916121000_549_person_detect_merge_candidates.sql"
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

Write-Host "===== AFRAKALA_FIX_MERGE_DETAIL_UTF8_BEGIN ====="
Log ("RepoRoot=" + $RepoRoot)

if (-not (Test-Path -LiteralPath $RepoRoot)) { Fail ("Missing " + $RepoRoot) }
Set-Location -LiteralPath $RepoRoot

$EnvFile = Join-Path $RepoRoot "deploy\lan\.env.lan"
if (-not (Test-Path -LiteralPath $EnvFile)) { Fail ("Missing " + $EnvFile) }

$MigPath = Join-Path $RepoRoot $MigFile
if (-not (Test-Path -LiteralPath $MigPath)) { Fail ("Missing migration file " + $MigPath) }

$pw = Get-EnvLineValue $EnvFile "POSTGRES_PASSWORD"
if (-not $pw) { Fail "POSTGRES_PASSWORD missing in .env.lan" }

$running = docker ps --filter ("name=" + $DbContainer) --format "{{.Names}}"
if (-not ($running -match [regex]::Escape($DbContainer))) {
  Fail ("DB container not running: " + $DbContainer)
}

# --- byte-safe apply: copy file into container, then psql -f ---
$RemoteSql = "/tmp/549_person_detect_merge_candidates.sql"
Log ("STEP docker cp -> " + $RemoteSql)
docker cp $MigPath ($DbContainer + ":" + $RemoteSql)
if ($LASTEXITCODE -ne 0) { Fail "docker cp failed" }

Log "STEP re-apply migration 549 (CREATE OR REPLACE)"
docker exec -e PGPASSWORD=$pw $DbContainer `
  psql -U supabase_admin -d $DbName -v ON_ERROR_STOP=1 `
  -c "SET client_encoding TO 'UTF8';" `
  -f $RemoteSql
if ($LASTEXITCODE -ne 0) { Fail "psql -f 549 failed" }

docker exec -e PGPASSWORD=$pw $DbContainer sh -lc ("rm -f " + $RemoteSql) | Out-Null

Log "STEP person_detect_merge_candidates(NULL)"
$detectOut = docker exec -e PGPASSWORD=$pw $DbContainer `
  psql -U supabase_admin -d $DbName -t -A -v ON_ERROR_STOP=1 `
  -c "SET client_encoding TO 'UTF8'; SELECT public.person_detect_merge_candidates(NULL);"
if ($LASTEXITCODE -ne 0) { Fail "person_detect_merge_candidates failed" }
Log ("DETECT_RESULT=" + ($detectOut | Out-String).Trim())

Log "STEP NOTIFY pgrst"
docker exec -e PGPASSWORD=$pw $DbContainer `
  psql -U supabase_admin -d $DbName -c "NOTIFY pgrst, 'reload schema';" | Out-Null

# Probe: sample pending details. Fail if majority are question-mark garbage.
Log "STEP probe pending detail encoding"
$probeSql = @"
SELECT COALESCE(string_agg(left(COALESCE(detail,''), 80), E'\n'), '')
FROM (
  SELECT detail
  FROM public.person_merge_candidates
  WHERE status = 'pending'
  ORDER BY created_at DESC
  LIMIT 8
) s;
"@
$sample = docker exec -e PGPASSWORD=$pw $DbContainer `
  psql -U supabase_admin -d $DbName -t -A -v ON_ERROR_STOP=1 `
  -c "SET client_encoding TO 'UTF8';" -c $probeSql
if ($LASTEXITCODE -ne 0) { Fail "probe query failed" }

$sampleText = ($sample | Out-String)
# Count ASCII '?' vs total non-space chars in sample
$q = ([regex]::Matches($sampleText, '\?')).Count
$nonSpace = ([regex]::Matches($sampleText, '\S')).Count
Log ("PROBE_QMARKS=" + $q + " PROBE_NONSPACE=" + $nonSpace)
if ($nonSpace -gt 20 -and ($q * 1.0 / $nonSpace) -gt 0.35) {
  Fail "Pending details still look corrupted (too many ?). Check DB encoding / which database name was used."
}

Write-Host "===== AFRAKALA_FIX_MERGE_DETAIL_UTF8_END ====="
Write-Host "FIX_OK: open http://192.168.170.10:3000/persons/merge and Ctrl+F5"
Write-Host "Detail lines under each card should be Persian again."
