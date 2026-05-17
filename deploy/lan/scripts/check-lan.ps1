# check-lan.ps1
# Health check for AfraKala LAN deployment.
# ASCII-only. Compatible with Windows PowerShell 5.1.

$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lanDir    = Resolve-Path (Join-Path $scriptDir "..")
$envFile   = Join-Path $lanDir ".env.lan"

function Get-EnvValue($path, $key, $fallback) {
    if (-not (Test-Path $path)) { return $fallback }
    $line = Select-String -Path $path -Pattern ("^\s*{0}=(.*)$" -f [regex]::Escape($key)) |
            Select-Object -First 1
    if ($line) {
        $v = $line.Matches.Groups[1].Value.Trim().Trim('"').Trim("'")
        if ($v) { return $v }
    }
    return $fallback
}

if (-not (Test-Path $envFile)) {
    Write-Host "deploy/lan/.env.lan not found. Create it from .env.lan.example first:" -ForegroundColor Red
    Write-Host "  powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\init-lan.ps1" -ForegroundColor Yellow
    exit 1
}

$appPort = Get-EnvValue $envFile "APP_PORT"          "3000"
$apiPort = Get-EnvValue $envFile "SUPABASE_API_PORT" "8000"
$lanIp   = Get-EnvValue $envFile "LAN_HOST_IP"       "LAN_HOST_IP"

function Test-Http($name, $url, $acceptStatus) {
    if (-not $acceptStatus) { $acceptStatus = @(200) }
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $url
        Write-Host ("[OK  ] {0,-18} {1}  HTTP {2}" -f $name, $url, $r.StatusCode) -ForegroundColor Green
    } catch {
        $resp = $_.Exception.Response
        if ($resp -and $acceptStatus -contains [int]$resp.StatusCode) {
            Write-Host ("[OK  ] {0,-18} {1}  HTTP {2} (reachable)" -f $name, $url, [int]$resp.StatusCode) -ForegroundColor Green
        } else {
            Write-Host ("[FAIL] {0,-18} {1}  -> {2}" -f $name, $url, $_.Exception.Message) -ForegroundColor Red
        }
    }
}

Write-Host "=== Docker ===" -ForegroundColor Cyan
try {
    docker info --format '{{.ServerVersion}}' | ForEach-Object {
        Write-Host ("Docker Server: {0}" -f $_) -ForegroundColor Green
    }
} catch {
    Write-Host "Docker is not available. Start Docker Desktop." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Containers ===" -ForegroundColor Cyan
docker ps -a --filter "name=afrakala-lan-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
Write-Host "=== Endpoints ===" -ForegroundColor Cyan
Test-Http "App health"    ("http://localhost:{0}/api/healthz" -f $appPort)
# Kong returns 404 on "/" by design (no route). Treat 404 as reachable.
Test-Http "Supabase Kong" ("http://localhost:{0}/" -f $apiPort) @(200, 404)
Test-Http "Auth health"   ("http://localhost:{0}/auth/v1/health" -f $apiPort) @(200, 401, 404)

Write-Host ""
Write-Host "=== LAN IPs ===" -ForegroundColor Cyan
$addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
    }
foreach ($a in $addrs) {
    Write-Host ("  {0} -> http://{1}:{2}  |  http://{1}:{3}" -f $a.InterfaceAlias, $a.IPAddress, $appPort, $apiPort)
}

Write-Host ""
Write-Host ("URL for LAN users: http://{0}:{1}" -f $lanIp, $appPort) -ForegroundColor Yellow
