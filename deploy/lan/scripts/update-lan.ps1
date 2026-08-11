# update-lan.ps1
# Quick update of LAN deployment from GitHub after Lovable changes.
# Works from repo root or from deploy/lan.
# ASCII-only. Compatible with Windows PowerShell 5.1.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lanDir    = Resolve-Path (Join-Path $scriptDir "..")
$repoRoot  = Resolve-Path (Join-Path $lanDir "..\..")

$composeFile = Join-Path $lanDir "docker-compose.yml"
$envFile     = Join-Path $lanDir ".env.lan"

if (-not (Test-Path $envFile)) {
    Write-Host "deploy/lan/.env.lan not found. Create it from .env.lan.example first." -ForegroundColor Red
    Write-Host "  powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\init-lan.ps1" -ForegroundColor Yellow
    exit 1
}

function Get-EnvValue($path, $key, $fallback) {
    $line = Select-String -Path $path -Pattern ("^\s*{0}=(.*)$" -f [regex]::Escape($key)) |
            Select-Object -First 1
    if ($line) {
        $v = $line.Matches.Groups[1].Value.Trim().Trim('"').Trim("'")
        if ($v) { return $v }
    }
    return $fallback
}

$appPort = Get-EnvValue $envFile "APP_PORT"          "3000"
$apiPort = Get-EnvValue $envFile "SUPABASE_API_PORT" "8000"
$lanIp   = Get-EnvValue $envFile "LAN_HOST_IP"       "LAN_HOST_IP"

Push-Location $repoRoot
try {
    # Pull the branch this checkout is actually on. This used to be hardcoded to
    # `main`, which on 2026-08-11 was 1646 commits behind the branch both servers
    # run (feature/navigation-modernization). Running it would have merged a
    # two-month-old branch into a live deployment.
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if (-not $branch -or $branch -eq "HEAD") {
        Write-Host "Detached HEAD - check out a branch before updating." -ForegroundColor Red
        exit 1
    }
    Write-Host ("[1/5] git pull --ff-only origin {0} ..." -f $branch) -ForegroundColor Cyan
    git pull --ff-only origin $branch
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Pull was not a fast-forward. This checkout has local commits or has" -ForegroundColor Red
        Write-Host "diverged from the remote. Resolve it by hand - do not force." -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "[2/5] Latest commit:" -ForegroundColor Cyan
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
    $healthUrl = "http://localhost:{0}/api/healthz" -f $appPort
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $healthUrl
            if ($r.StatusCode -eq 200) {
                Write-Host ("App health OK (200) at {0}." -f $healthUrl) -ForegroundColor Green
                break
            }
        } catch {
            Start-Sleep -Seconds 2
        }
        if ($i -eq 19) {
            Write-Host "App did not respond yet. Check: docker compose logs -f web" -ForegroundColor Yellow
        }
    }

    Write-Host ""
    Write-Host "=== LAN URLs for users ===" -ForegroundColor Cyan
    Write-Host ("App          : http://{0}:{1}" -f $lanIp, $appPort) -ForegroundColor Green
    Write-Host ("Supabase API : http://{0}:{1}" -f $lanIp, $apiPort) -ForegroundColor Green
}
finally {
    Pop-Location
}
