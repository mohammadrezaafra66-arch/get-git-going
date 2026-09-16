# MINI read-only discovery for production (ASCII). Paste into PowerShell and run.
# Signature: PowerShell 5.1 safe ASCII MINI
$ErrorActionPreference = "Continue"
Write-Host "==== MINI PROD DISCOVERY ===="
Write-Host ("PC=" + $env:COMPUTERNAME + " user=" + $env:USERNAME + " ps=" + $PSVersionTable.PSVersion)
Write-Host "==== docker web ===="
docker ps -a --filter "name=afrakala-lan-web" --format "{{.Names}} {{.Status}} {{.Ports}}"
$j = docker inspect afrakala-lan-web 2>$null | ConvertFrom-Json
if ($j) {
  if ($j -is [Array]) { $c = $j[0] } else { $c = $j }
  $L = $c.Config.Labels
  Write-Host ("working_dir=" + $L.'com.docker.compose.project.working_dir')
  Write-Host ("config_files=" + $L.'com.docker.compose.project.config_files')
  Write-Host ("image=" + $c.Config.Image)
  Write-Host ("APP_GIT_SHA=" + (($c.Config.Env | Where-Object { $_ -like "APP_GIT_SHA=*" } | Select-Object -First 1)))
  Write-Host ("APP_PORT_ENV=" + (($c.Config.Env | Where-Object { $_ -like "APP_PORT=*" } | Select-Object -First 1)))
  Write-Host ("ISSABEL_env_count=" + @($c.Config.Env | Where-Object { $_ -like "ISSABEL_*" }).Count)
  Write-Host ("PRICING_token_count=" + @($c.Config.Env | Where-Object { $_ -like "PRICING_WORKER_TOKEN=*" }).Count)
}
Write-Host "==== /api/version ===="
foreach ($p in 3000,3100,80) {
  foreach ($h in "127.0.0.1","192.168.170.10") {
    $u = "http://${h}:${p}/api/version"
    try { Write-Host ($u + " => " + (Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 3).Content) }
    catch { Write-Host ($u + " => FAIL") }
  }
}
Write-Host "==== clone paths ===="
foreach ($p in @("C:\afrakala","C:\afrakala\app","C:\AfraKalaServer\get-git-going01lan","C:\AfraKalaServer\get-git-going01lan\app")) {
  $g = Test-Path (Join-Path $p ".git")
  $c = Test-Path (Join-Path $p "deploy\lan\docker-compose.yml")
  Write-Host ("path=" + $p + " exists=" + (Test-Path $p) + " git=" + $g + " compose=" + $c)
  if ($g) {
    Push-Location $p
    Write-Host ("  branch=" + (git rev-parse --abbrev-ref HEAD 2>$null) + " HEAD=" + (git rev-parse --short HEAD 2>$null))
    Pop-Location
  }
}
Write-Host "==== db container ===="
docker ps -a --format "{{.Names}} {{.Status}}" | Select-String "db"
Write-Host "==== env.lan presence ===="
foreach ($e in @(
  "C:\afrakala\deploy\lan\.env.lan",
  "C:\afrakala\app\deploy\lan\.env.lan",
  "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan",
  "C:\AfraKalaServer\get-git-going01lan\app\deploy\lan\.env.lan"
)) {
  if (Test-Path $e) {
    $keys = Get-Content $e | ForEach-Object { if ($_ -match '^\s*([A-Za-z0-9_]+)=') { $Matches[1] } }
    Write-Host ("env=" + $e)
    foreach ($k in @("APP_PORT","POSTGRES_DB","ISSABEL_CDR_HOST","ISSABEL_IMPORT_WORKER_TOKEN","PRICING_WORKER_TOKEN")) {
      Write-Host ("  " + $k + " present=" + ($keys -contains $k))
    }
  } else { Write-Host ("env=" + $e + " MISSING") }
}
Write-Host "==== tasks ===="
Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match "Afra|Issabel|Pricing" } | ForEach-Object {
  Write-Host ("Task=" + $_.TaskName + " State=" + $_.State)
}
Write-Host "==== DONE: copy all output above ===="
