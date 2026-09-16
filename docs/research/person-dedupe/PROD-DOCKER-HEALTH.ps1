# ASCII-only. Run on PRODUCTION. Read-only health check before cutover.
$ErrorActionPreference = "Continue"
Write-Host "==== DOCKER HEALTH ===="
docker version 2>&1 | Select-Object -First 12
Write-Host "---- ps ----"
docker ps --format '{{.Names}} {{.Status}}' 2>&1
Write-Host "---- db ----"
docker inspect afrakala-lan-db --format '{{.State.Status}}' 2>&1
Write-Host "---- web ----"
docker inspect afrakala-lan-web --format '{{.State.Status}} health={{.State.Health.Status}}' 2>&1
Write-Host "---- version ----"
try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri 'http://127.0.0.1:3000/api/version').Content } catch { $_.Exception.Message }
Write-Host "==== END ===="
Write-Host "Reply with: DOCKER_OK=yes/no and paste this output"
