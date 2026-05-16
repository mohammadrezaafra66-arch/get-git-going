# firewall-lan-admin.ps1
# باز کردن پورت‌های LAN Pilot افراکالا در Windows Firewall.
# باید با PowerShell Administrator اجرا شود.

$ErrorActionPreference = "Stop"

# --- بررسی Administrator ---
$current = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "این اسکریپت باید با PowerShell به‌عنوان Administrator اجرا شود." -ForegroundColor Red
    Write-Host "روی Start کلیک راست -> Windows PowerShell (Admin) -> دوباره اجرا کنید." -ForegroundColor Yellow
    exit 1
}

# --- خواندن portها از .env.lan ---
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

$appPort = Get-EnvValue $envFile "APP_PORT"          "3000"
$apiPort = Get-EnvValue $envFile "SUPABASE_API_PORT" "8000"

# --- اضافه کردن ruleها ---
function Add-LanRule($displayName, $port) {
    $existing = Get-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host ("rule از قبل وجود دارد: {0}" -f $displayName) -ForegroundColor Yellow
        return
    }
    New-NetFirewallRule `
        -DisplayName $displayName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $port `
        -Action Allow `
        -Profile Private,Domain | Out-Null
    Write-Host ("rule اضافه شد: {0} (TCP {1})" -f $displayName, $port) -ForegroundColor Green
}

Add-LanRule ("AfraKala LAN App {0}"          -f $appPort) $appPort
Add-LanRule ("AfraKala LAN Supabase API {0}" -f $apiPort) $apiPort

Write-Host ""
Write-Host "Firewall آماده شد. این پنجره PowerShell Admin را ببندید." -ForegroundColor Green
Write-Host "ادامه کار را با PowerShell عادی انجام دهید:" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1" -ForegroundColor Gray
