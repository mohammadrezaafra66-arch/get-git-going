# update-lan.ps1
# آپدیت سریع LAN deployment از GitHub بعد از تغییرات Lovable.
# اجرا از root پروژه یا از deploy/lan هر دو پشتیبانی می‌شود.

$ErrorActionPreference = "Stop"

# پیدا کردن root پروژه (دایرکتوری حاوی deploy/lan)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lanDir    = Resolve-Path (Join-Path $scriptDir "..")
$repoRoot  = Resolve-Path (Join-Path $lanDir "..\..")

$composeFile = Join-Path $lanDir "docker-compose.yml"
$envFile     = Join-Path $lanDir ".env.lan"

if (-not (Test-Path $envFile)) {
    Write-Host "deploy/lan/.env.lan پیدا نشد. ابتدا از .env.lan.example بسازید." -ForegroundColor Red
    exit 1
}

Push-Location $repoRoot
try {
    Write-Host "[1/5] git pull origin main ..." -ForegroundColor Cyan
    git pull origin main

    Write-Host ""
    Write-Host "[2/5] آخرین commit:" -ForegroundColor Cyan
    git log -1 --pretty=format:"%h  %an  %s" | Write-Host
    Write-Host ""

    Write-Host "[3/5] docker compose build ..." -ForegroundColor Cyan
    docker compose -f $composeFile --env-file $envFile build

    Write-Host ""
    Write-Host "[4/5] docker compose up -d ..." -ForegroundColor Cyan
    docker compose -f $composeFile --env-file $envFile up -d

    Write-Host ""
    Write-Host "[5/5] health check ..." -ForegroundColor Cyan
    Start-Sleep -Seconds 5
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 `
                 -Uri "http://localhost:3000/api/healthz"
            if ($r.StatusCode -eq 200) {
                Write-Host "App health OK (200)." -ForegroundColor Green
                break
            }
        } catch {
            Start-Sleep -Seconds 2
        }
        if ($i -eq 19) {
            Write-Host "App هنوز جواب نداد. docker compose logs -f web را بررسی کنید." -ForegroundColor Yellow
        }
    }

    # نمایش آدرس کاربران
    $lanIp = (Select-String -Path $envFile -Pattern "^LAN_HOST_IP=(.*)$" |
              Select-Object -First 1).Matches.Groups[1].Value
    if (-not $lanIp) { $lanIp = "LAN_HOST_IP" }

    Write-Host ""
    Write-Host "=== آدرس برای کاربران شبکه ===" -ForegroundColor Cyan
    Write-Host ("App          : http://{0}:3000" -f $lanIp) -ForegroundColor Green
    Write-Host ("Supabase API : http://{0}:8000" -f $lanIp) -ForegroundColor Green
}
finally {
    Pop-Location
}