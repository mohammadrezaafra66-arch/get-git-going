# check-lan.ps1
# تست وضعیت LAN deployment افراکالا.

$ErrorActionPreference = "Continue"

# پیدا کردن .env.lan و خواندن portها
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
    Write-Host "deploy/lan/.env.lan پیدا نشد. ابتدا از .env.lan.example کپی کنید:" -ForegroundColor Red
    Write-Host "  Copy-Item deploy\lan\.env.lan.example deploy\lan\.env.lan" -ForegroundColor Yellow
    exit 1
}

$appPort = Get-EnvValue $envFile "APP_PORT"          "3000"
$apiPort = Get-EnvValue $envFile "SUPABASE_API_PORT" "8000"
$lanIp   = Get-EnvValue $envFile "LAN_HOST_IP"       "LAN_HOST_IP"

function Test-Http($name, $url) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $url
        Write-Host ("[OK ] {0,-18} {1}  HTTP {2}" -f $name, $url, $r.StatusCode) -ForegroundColor Green
    } catch {
        Write-Host ("[FAIL] {0,-18} {1}  -> {2}" -f $name, $url, $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host "=== Docker ===" -ForegroundColor Cyan
try {
    docker info --format '{{.ServerVersion}}' | ForEach-Object {
        Write-Host ("Docker Server: {0}" -f $_) -ForegroundColor Green
    }
} catch {
    Write-Host "Docker در دسترس نیست. Docker Desktop را اجرا کنید." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Containers ===" -ForegroundColor Cyan
docker ps --filter "name=afrakala-lan-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
Write-Host "=== Endpoints ===" -ForegroundColor Cyan
Test-Http "App health"    ("http://localhost:{0}/api/healthz" -f $appPort)
Test-Http "Supabase Kong" ("http://localhost:{0}/" -f $apiPort)

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
Write-Host ("آدرس برای همکاران: http://{0}:{1}" -f $lanIp, $appPort) -ForegroundColor Yellow