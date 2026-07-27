# init-lan.ps1
# Initial setup for AfraKala LAN Pilot on the company laptop.
# - Creates deploy/lan/.env.lan from example
# - Sets IP and ports
# - Generates POSTGRES_PASSWORD / JWT_SECRET / ANON_KEY / SERVICE_ROLE_KEY if empty
# - Copies kong.yml from example if missing
# Secrets are never printed. Nothing is committed.
# ASCII-only. Compatible with Windows PowerShell 5.1.

param(
    [switch]$RotateSecrets
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lanDir    = Resolve-Path (Join-Path $scriptDir "..")
$repoRoot  = Resolve-Path (Join-Path $lanDir "..\..")

$envExample = Join-Path $lanDir ".env.lan.example"
$envFile    = Join-Path $lanDir ".env.lan"

$kongDir     = Join-Path $repoRoot "deploy\supabase\volumes\api"
$kongFile    = Join-Path $kongDir "kong.yml"
$kongExample = Join-Path $repoRoot "deploy\supabase\kong.yml.example"

# --- 1. Get IP ---
# Default is the DEV machine (192.168.170.8), not the production laptop.
# It used to default to 192.168.170.10 (production). On a fresh setup - when
# .env.lan does not exist yet - pressing Enter would have pointed this
# environment at the production Supabase/database. See the production guard
# below, which now also refuses that IP without an explicit confirmation.
$productionIp = "192.168.170.10"
$defaultIp = "192.168.170.8"
if (Test-Path $envFile) {
    $existingIpLine = Select-String -Path $envFile -Pattern '^\s*LAN_HOST_IP=(.*)$' | Select-Object -First 1
    if ($existingIpLine) {
        $existingIp = $existingIpLine.Matches.Groups[1].Value.Trim().Trim('"').Trim("'")
        if ($existingIp) { $defaultIp = $existingIp }
    }
}
$inputIp = Read-Host ("Enter laptop LAN IP [{0}]" -f $defaultIp)
if ([string]::IsNullOrWhiteSpace($inputIp)) { $inputIp = $defaultIp }

if ($inputIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    Write-Host ("Invalid IP: {0}" -f $inputIp) -ForegroundColor Red
    exit 1
}

# --- 1b. Production guard ---
# Pointing a dev/test environment at the production laptop makes the app read
# and WRITE the real users' database. Never allow that on a bare Enter.
if ($inputIp -eq $productionIp) {
    Write-Host ""
    Write-Host ("WARNING: {0} is the PRODUCTION laptop." -f $productionIp) -ForegroundColor Red
    Write-Host "Continuing will point this environment at the live Supabase/database," -ForegroundColor Red
    Write-Host "so anything you do here can read and WRITE real user data." -ForegroundColor Red
    Write-Host "If you meant the development machine, abort and enter 192.168.170.8 instead." -ForegroundColor Yellow
    $confirm = Read-Host "Type EXACTLY 'I-KNOW-THIS-IS-PRODUCTION' to continue, or anything else to abort"
    if ($confirm -ne "I-KNOW-THIS-IS-PRODUCTION") {
        Write-Host "Aborted. Nothing was changed." -ForegroundColor Green
        exit 1
    }
    Write-Host "Confirmed. Proceeding with the PRODUCTION IP." -ForegroundColor Yellow
}

$lanIp = $inputIp

# --- 2. Create .env.lan from example ---
if (-not (Test-Path $envExample)) {
    Write-Host "deploy/lan/.env.lan.example not found." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
    Write-Host ".env.lan created from example." -ForegroundColor Green
} else {
    Write-Host ".env.lan already exists; existing values are preserved." -ForegroundColor Yellow
}
if ($RotateSecrets) {
    Write-Host "RotateSecrets enabled: LAN database/JWT/API secrets will be regenerated without printing values." -ForegroundColor Yellow
}

# --- helpers ---
function Read-EnvMap($path) {
    $map = [ordered]@{}
    $lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)
    foreach ($line in $lines) {
        if ($line -match '^\s*#') { continue }
        if ($line -match '^\s*$') { continue }
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            $k = $Matches[1]
            $v = $Matches[2]
            $v = $v.Trim().Trim('"').Trim("'")
            $map[$k] = $v
        }
    }
    return $map
}

function Set-EnvValue($path, $key, $value) {
    $newLine = "{0}={1}" -f $key, $value
    $lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match ("^\s*{0}=" -f [regex]::Escape($key))) {
            $lines[$i] = $newLine
            $found = $true
        }
    }
    if (-not $found) {
        $lines += $newLine
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($path, [string[]]$lines, $utf8NoBom)
}

function New-RandomSecret($byteCount) {
    $bytes = New-Object byte[] $byteCount
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $b64 = [Convert]::ToBase64String($bytes)
    return ($b64 -replace '\+','-' -replace '/','_' -replace '=','')
}

function ConvertTo-Base64Url($bytes) {
    $b64 = [Convert]::ToBase64String($bytes)
    return ($b64 -replace '\+','-' -replace '/','_' -replace '=','')
}

function New-SupabaseJwt($role, $secret) {
    $headerObj  = [ordered]@{ alg = "HS256"; typ = "JWT" }
    $epoch = New-Object DateTime 1970,1,1,0,0,0,([DateTimeKind]::Utc)
    $iat = [int][math]::Floor(((Get-Date).ToUniversalTime() - $epoch).TotalSeconds)
    $exp = $iat + (60 * 60 * 24 * 365 * 10)
    $payloadObj = [ordered]@{
        role = $role
        iss  = "supabase"
        iat  = $iat
        exp  = $exp
    }
    $headerJson  = ($headerObj  | ConvertTo-Json -Compress)
    $payloadJson = ($payloadObj | ConvertTo-Json -Compress)

    $enc = [System.Text.Encoding]::UTF8
    $headerB64  = ConvertTo-Base64Url $enc.GetBytes($headerJson)
    $payloadB64 = ConvertTo-Base64Url $enc.GetBytes($payloadJson)

    $signingInput = "{0}.{1}" -f $headerB64, $payloadB64
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $enc.GetBytes($secret)
    $sigBytes = $hmac.ComputeHash($enc.GetBytes($signingInput))
    $sigB64 = ConvertTo-Base64Url $sigBytes

    return "{0}.{1}" -f $signingInput, $sigB64
}

# --- 3. Set IP and ports ---
$env = Read-EnvMap $envFile
$appPort = $env["APP_PORT"]
$apiPort = $env["SUPABASE_API_PORT"]
if ([string]::IsNullOrWhiteSpace($appPort)) { $appPort = "3000" }
if ([string]::IsNullOrWhiteSpace($apiPort)) { $apiPort = "8000" }

Set-EnvValue $envFile "LAN_HOST_IP"             $lanIp
Set-EnvValue $envFile "APP_PORT"                $appPort
Set-EnvValue $envFile "SUPABASE_API_PORT"       $apiPort
Set-EnvValue $envFile "VITE_SUPABASE_URL"       ("http://{0}:{1}" -f $lanIp, $apiPort)
Set-EnvValue $envFile "SITE_URL"                ("http://{0}:{1}" -f $lanIp, $appPort)
Set-EnvValue $envFile "API_EXTERNAL_URL"        ("http://{0}:{1}" -f $lanIp, $apiPort)
Set-EnvValue $envFile "ADDITIONAL_REDIRECT_URLS" ("http://{0}:{1},http://localhost:{1}" -f $lanIp, $appPort)
Set-EnvValue $envFile "VITE_SUPABASE_PROJECT_ID" "afrakala-lan"
Set-EnvValue $envFile "SUPABASE_URL"            "http://kong:8000"
Set-EnvValue $envFile "OCR_ENABLED"             "false"
Set-EnvValue $envFile "LOVABLE_API_KEY"         ""
Set-EnvValue $envFile "NODE_ENV"                "production"
Set-EnvValue $envFile "PORT"                    $appPort
Set-EnvValue $envFile "HOST"                    "0.0.0.0"

Write-Host "IP and ports set in .env.lan." -ForegroundColor Green

# --- 4/5/6/7. Generate secrets if empty ---
$env = Read-EnvMap $envFile

if ($RotateSecrets -or [string]::IsNullOrWhiteSpace($env["POSTGRES_PASSWORD"])) {
    Set-EnvValue $envFile "POSTGRES_PASSWORD" (New-RandomSecret 24)
    if ($RotateSecrets) {
        Write-Host "POSTGRES_PASSWORD rotated." -ForegroundColor Green
    } else {
        Write-Host "POSTGRES_PASSWORD generated." -ForegroundColor Green
    }
} else {
    Write-Host "POSTGRES_PASSWORD already set - kept." -ForegroundColor Yellow
}

$env = Read-EnvMap $envFile
$jwtSecret = $env["JWT_SECRET"]
if ($RotateSecrets -or [string]::IsNullOrWhiteSpace($jwtSecret) -or $jwtSecret.Length -lt 32) {
    $jwtSecret = New-RandomSecret 48
    Set-EnvValue $envFile "JWT_SECRET" $jwtSecret
    if ($RotateSecrets) {
        Write-Host "JWT_SECRET rotated." -ForegroundColor Green
    } else {
        Write-Host "JWT_SECRET generated." -ForegroundColor Green
    }
} else {
    Write-Host "JWT_SECRET already set - kept." -ForegroundColor Yellow
}
Set-EnvValue $envFile "JWT_EXPIRY" "3600"

$env = Read-EnvMap $envFile
$anon    = $env["ANON_KEY"]
$service = $env["SERVICE_ROLE_KEY"]

if ($RotateSecrets -or [string]::IsNullOrWhiteSpace($anon) -or [string]::IsNullOrWhiteSpace($service)) {
    $anon    = New-SupabaseJwt "anon"         $jwtSecret
    $service = New-SupabaseJwt "service_role" $jwtSecret
    Set-EnvValue $envFile "ANON_KEY"         $anon
    Set-EnvValue $envFile "SERVICE_ROLE_KEY" $service
    if ($RotateSecrets) {
        Write-Host "ANON_KEY and SERVICE_ROLE_KEY rotated." -ForegroundColor Green
    } else {
        Write-Host "ANON_KEY and SERVICE_ROLE_KEY generated." -ForegroundColor Green
    }
} else {
    Write-Host "ANON_KEY and SERVICE_ROLE_KEY already set - kept." -ForegroundColor Yellow
}

Set-EnvValue $envFile "VITE_SUPABASE_PUBLISHABLE_KEY" $anon
Set-EnvValue $envFile "SUPABASE_PUBLISHABLE_KEY"      $anon
Set-EnvValue $envFile "SUPABASE_SERVICE_ROLE_KEY"     $service

# --- 10/11. kong.yml ---
if (-not (Test-Path $kongDir)) {
    New-Item -ItemType Directory -Force -Path $kongDir | Out-Null
    Write-Host "deploy/supabase/volumes/api created." -ForegroundColor Green
}
if (-not (Test-Path $kongFile)) {
    if (-not (Test-Path $kongExample)) {
        Write-Host "deploy/supabase/kong.yml.example not found." -ForegroundColor Red
        exit 1
    }
    Copy-Item $kongExample $kongFile
    Write-Host "kong.yml copied from example." -ForegroundColor Green
} else {
    Write-Host "kong.yml already exists - kept." -ForegroundColor Yellow
}

# --- Next steps ---
Write-Host ""
Write-Host "=== Next steps ===" -ForegroundColor Cyan
Write-Host "1) Open firewall ports (run PowerShell as Administrator):" -ForegroundColor White
Write-Host "   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\firewall-lan-admin.ps1" -ForegroundColor Gray
Write-Host "2) Build and start the stack (normal PowerShell):" -ForegroundColor White
Write-Host "   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1" -ForegroundColor Gray
Write-Host "3) Health check:" -ForegroundColor White
Write-Host "   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\check-lan.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host ("LAN users URL: http://{0}:3000" -f $lanIp) -ForegroundColor Green
Write-Host ""
Write-Host "WARNING: Never commit deploy/lan/.env.lan." -ForegroundColor Yellow
