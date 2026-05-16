# check-lan.ps1
# تست وضعیت LAN deployment افراکالا.

$ErrorActionPreference = "Continue"

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
Test-Http "App health"    "http://localhost:3000/api/healthz"
Test-Http "Supabase Kong" "http://localhost:8000/"

Write-Host ""
Write-Host "=== LAN IPs ===" -ForegroundColor Cyan
$addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
    }
foreach ($a in $addrs) {
    Write-Host ("  {0} -> http://{1}:3000  |  http://{1}:8000" -f $a.InterfaceAlias, $a.IPAddress)
}

Write-Host ""
Write-Host "آدرسی که به همکاران بدهید: http://<IP لپ‌تاپ شما>:3000" -ForegroundColor Yellow