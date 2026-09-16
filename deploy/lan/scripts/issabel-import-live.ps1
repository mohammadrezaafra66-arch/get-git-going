# issabel-import-live.ps1
# Pulls Issabel CDR into AfraKala every few minutes (host-side live driver).
# Reads ISSABEL_IMPORT_WORKER_TOKEN from deploy/lan/.env.lan — never prints it.
# ASCII-only. Compatible with Windows PowerShell 5.1.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lanDir = Resolve-Path (Join-Path $scriptDir "..")
$repoRoot = Resolve-Path (Join-Path $lanDir "..\..")
$envFile = Join-Path $lanDir ".env.lan"
$logDir = Join-Path $lanDir "logs"
$logFile = Join-Path $logDir "issabel-import-live.log"

if (-not (Test-Path $envFile)) {
  throw ".env.lan not found: $envFile"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Get-EnvValue([string]$path, [string]$key) {
  $line = Select-String -Path $path -Pattern ("^\s*{0}=(.*)$" -f [regex]::Escape($key)) |
    Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Matches.Groups[1].Value.Trim().Trim('"').Trim("'")
}

$token = Get-EnvValue $envFile "ISSABEL_IMPORT_WORKER_TOKEN"
if (-not $token) {
  throw "ISSABEL_IMPORT_WORKER_TOKEN missing in .env.lan"
}

# LAN web publishes APP_PORT (often 3100). Prefer LAN compose default.
$appPort = Get-EnvValue $envFile "APP_PORT"
if (-not $appPort) { $appPort = "3100" }
$endpoint = "http://127.0.0.1:{0}/api/public/hooks/import-issabel-calls" -f $appPort

$ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
try {
  $resp = Invoke-WebRequest -UseBasicParsing -Method POST -Uri $endpoint `
    -Headers @{ Authorization = "Bearer $token" } `
    -ContentType "application/json" `
    -Body "{}" `
    -TimeoutSec 180
  $snippet = $resp.Content
  if ($snippet.Length -gt 500) { $snippet = $snippet.Substring(0, 500) + "..." }
  Add-Content -Path $logFile -Value ("[{0}] HTTP {1} {2}" -f $ts, $resp.StatusCode, $snippet)
  exit 0
} catch {
  Add-Content -Path $logFile -Value ("[{0}] ERROR {1}" -f $ts, $_.Exception.Message)
  exit 1
}
