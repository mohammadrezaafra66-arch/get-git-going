# firewall-lan-admin.ps1
# Open AfraKala LAN Pilot ports in Windows Firewall.
# Must be run from PowerShell as Administrator.
# ASCII-only. Compatible with Windows PowerShell 5.1.

$ErrorActionPreference = "Stop"

# --- Check Administrator ---
$current = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script must be run from PowerShell as Administrator." -ForegroundColor Red
    Write-Host "Right-click Start -> Windows PowerShell (Admin) -> run again." -ForegroundColor Yellow
    exit 1
}

# --- Read ports from .env.lan ---
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

# --- Add rules ---
function Add-LanRule($displayName, $port) {
    $existing = Get-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host ("Rule already exists: {0}" -f $displayName) -ForegroundColor Yellow
        return
    }
    New-NetFirewallRule `
        -DisplayName $displayName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $port `
        -Action Allow `
        -Profile Private,Domain | Out-Null
    Write-Host ("Rule added: {0} (TCP {1})" -f $displayName, $port) -ForegroundColor Green
}

Add-LanRule ("AfraKala LAN App {0}"          -f $appPort) $appPort
Add-LanRule ("AfraKala LAN Supabase API {0}" -f $apiPort) $apiPort

Write-Host ""
Write-Host "Firewall is ready. You can close this Admin PowerShell window." -ForegroundColor Green
Write-Host "Continue in a normal PowerShell window:" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1" -ForegroundColor Gray
