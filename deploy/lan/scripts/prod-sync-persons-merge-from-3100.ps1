#Requires -Version 5.1
# Bring PRODUCTION :3000 to staging tip (includes persons-merge button like :3100).
# Keeps prod WITHOUT yellow staging banner (VITE_APP_ENV=production stays as-is).
# Run as Admin on PRODUCTION only. Never: docker compose down -v
$ErrorActionPreference = "Stop"
Set-Location C:\afrakala

Write-Host "===== AFRAKALA_SYNC_3100_FEATURES_BEGIN ====="
git fetch origin
git checkout staging
git pull origin staging
$head = (git rev-parse --short HEAD).Trim()
Write-Host "HEAD=$head"
if (-not (Test-Path .\src\routes\_app.persons_.merge.tsx)) { throw "missing persons merge route" }
# Expect tip at/after 3fa516f1 (persons merge on staging)
Write-Host "TIP_NOTE=expect 3fa516f1 or newer"

$env:GIT_SHA = $head
$env:BUILD_TIME = (Get-Date -Format o)
Write-Host "BUILDING $env:GIT_SHA"
docker compose --env-file deploy\lan\.env.lan -f deploy\lan\docker-compose.yml up -d --no-deps --build web
if ($LASTEXITCODE -ne 0) { throw "web build/up failed" }

$ok = $false
for ($i = 1; $i -le 48; $i++) {
  Start-Sleep -Seconds 5
  $st = docker ps --filter name=afrakala-lan-web --format "{{.Status}}"
  Write-Host "web try $i : $st"
  if ($st -match "healthy") { $ok = $true; break }
}
if (-not $ok) { throw "web not healthy" }

$sha = (docker compose --env-file deploy\lan\.env.lan -f deploy\lan\docker-compose.yml exec -T web printenv APP_GIT_SHA).Trim()
$ver = Invoke-RestMethod http://127.0.0.1:3000/api/version -TimeoutSec 30
Write-Host "APP_GIT_SHA=$sha VERSION=$($ver.commit)"
if ($sha -ne $head) { throw "SHA mismatch" }

foreach ($p in @("/persons/merge", "/torob-ops", "/operations/sales-desk")) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ("http://127.0.0.1:3000" + $p) -MaximumRedirection 0
    Write-Host "SMOKE $p -> $($r.StatusCode)"
  } catch {
    if ($_.Exception.Response) { Write-Host "SMOKE $p -> $([int]$_.Exception.Response.StatusCode)" }
    else { throw "SMOKE $p FAIL $($_.Exception.Message)" }
  }
}

# Session dependency on THIS host (not :9000)
Write-Host "AUTH_HEALTH=$(curl.exe -s -o NUL -w '%{http_code}' http://127.0.0.1:8000/auth/v1/health)"
Write-Host "===== AFRAKALA_SYNC_3100_FEATURES_END ====="
Write-Host "SYNC_OK HEAD=$head (features like 3100; no yellow banner if VITE_APP_ENV=production)"
