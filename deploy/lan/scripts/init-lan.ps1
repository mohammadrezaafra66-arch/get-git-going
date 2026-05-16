# init-lan.ps1
# آماده‌سازی اولیه LAN Pilot افراکالا روی لپ‌تاپ شرکت.
# - ساخت deploy/lan/.env.lan از روی example
# - تنظیم IP و portها
# - تولید POSTGRES_PASSWORD / JWT_SECRET / ANON_KEY / SERVICE_ROLE_KEY اگر خالی باشند
# - کپی kong.yml از example اگر وجود نداشته باشد
# هیچ secret در console چاپ نمی‌شود. هیچ چیزی commit نمی‌شود.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lanDir    = Resolve-Path (Join-Path $scriptDir "..")
$repoRoot  = Resolve-Path (Join-Path $lanDir "..\..")

$envExample = Join-Path $lanDir ".env.lan.example"
$envFile    = Join-Path $lanDir ".env.lan"

$kongDir     = Join-Path $repoRoot "deploy\supabase\volumes\api"
$kongFile    = Join-Path $kongDir "kong.yml"
$kongExample = Join-Path $repoRoot "deploy\supabase\kong.yml.example"

# --- 1. گرفتن IP ---
$defaultIp = "192.168.170.10"
$inputIp = Read-Host ("IP لپ‌تاپ روی شبکه شرکت را وارد کنید [{0}]" -f $defaultIp)
if ([string]::IsNullOrWhiteSpace($inputIp)) { $inputIp = $defaultIp }

if ($inputIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    Write-Host "IP نامعتبر است: $inputIp" -ForegroundColor Red
    exit 1
}
$lanIp = $inputIp

# --- 2. ساخت .env.lan از example ---
if (-not (Test-Path $envExample)) {
    Write-Host "deploy/lan/.env.lan.example پیدا نشد." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
    Write-Host ".env.lan از روی example ساخته شد." -ForegroundColor Green
} else {
    Write-Host ".env.lan از قبل وجود دارد؛ مقادیر موجود حفظ می‌شوند." -ForegroundColor Yellow
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
    # url-safe base64 without padding
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
    # 10 سال اعتبار
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

# --- 3. ست کردن IP و portها ---
Set-EnvValue $envFile "LAN_HOST_IP"             $lanIp
Set-EnvValue $envFile "APP_PORT"                "3000"
Set-EnvValue $envFile "SUPABASE_API_PORT"       "8000"
Set-EnvValue $envFile "VITE_SUPABASE_URL"       ("http://{0}:8000" -f $lanIp)
Set-EnvValue $envFile "SITE_URL"                ("http://{0}:3000" -f $lanIp)
Set-EnvValue $envFile "API_EXTERNAL_URL"        ("http://{0}:8000" -f $lanIp)
Set-EnvValue $envFile "ADDITIONAL_REDIRECT_URLS" ("http://{0}:3000,http://localhost:3000" -f $lanIp)
Set-EnvValue $envFile "VITE_SUPABASE_PROJECT_ID" "afrakala-lan"
Set-EnvValue $envFile "SUPABASE_URL"            "http://kong:8000"
Set-EnvValue $envFile "OCR_ENABLED"             "false"
Set-EnvValue $envFile "LOVABLE_API_KEY"         ""
Set-EnvValue $envFile "NODE_ENV"                "production"
Set-EnvValue $envFile "PORT"                    "3000"
Set-EnvValue $envFile "HOST"                    "0.0.0.0"

Write-Host "IP و portها در .env.lan تنظیم شد." -ForegroundColor Green

# --- 4/5/6/7. ساخت secretها اگر خالی هستند ---
$env = Read-EnvMap $envFile

if ([string]::IsNullOrWhiteSpace($env["POSTGRES_PASSWORD"])) {
    Set-EnvValue $envFile "POSTGRES_PASSWORD" (New-RandomSecret 24)
    Write-Host "POSTGRES_PASSWORD تولید شد." -ForegroundColor Green
} else {
    Write-Host "POSTGRES_PASSWORD از قبل تنظیم شده — تغییر نکرد." -ForegroundColor Yellow
}

$env = Read-EnvMap $envFile
$jwtSecret = $env["JWT_SECRET"]
if ([string]::IsNullOrWhiteSpace($jwtSecret) -or $jwtSecret.Length -lt 32) {
    $jwtSecret = New-RandomSecret 48
    Set-EnvValue $envFile "JWT_SECRET" $jwtSecret
    Write-Host "JWT_SECRET تولید شد." -ForegroundColor Green
} else {
    Write-Host "JWT_SECRET از قبل تنظیم شده — تغییر نکرد." -ForegroundColor Yellow
}
Set-EnvValue $envFile "JWT_EXPIRY" "3600"

$env = Read-EnvMap $envFile
$anon    = $env["ANON_KEY"]
$service = $env["SERVICE_ROLE_KEY"]

if ([string]::IsNullOrWhiteSpace($anon) -or [string]::IsNullOrWhiteSpace($service)) {
    $anon    = New-SupabaseJwt "anon"         $jwtSecret
    $service = New-SupabaseJwt "service_role" $jwtSecret
    Set-EnvValue $envFile "ANON_KEY"         $anon
    Set-EnvValue $envFile "SERVICE_ROLE_KEY" $service
    Write-Host "ANON_KEY و SERVICE_ROLE_KEY تولید شدند." -ForegroundColor Green
} else {
    Write-Host "ANON_KEY و SERVICE_ROLE_KEY از قبل تنظیم شده‌اند — تغییر نکردند." -ForegroundColor Yellow
}

Set-EnvValue $envFile "VITE_SUPABASE_PUBLISHABLE_KEY" $anon
Set-EnvValue $envFile "SUPABASE_PUBLISHABLE_KEY"      $anon
Set-EnvValue $envFile "SUPABASE_SERVICE_ROLE_KEY"     $service

# --- 10/11. kong.yml ---
if (-not (Test-Path $kongDir)) {
    New-Item -ItemType Directory -Force -Path $kongDir | Out-Null
    Write-Host "deploy/supabase/volumes/api ساخته شد." -ForegroundColor Green
}
if (-not (Test-Path $kongFile)) {
    if (-not (Test-Path $kongExample)) {
        Write-Host "deploy/supabase/kong.yml.example پیدا نشد." -ForegroundColor Red
        exit 1
    }
    Copy-Item $kongExample $kongFile
    Write-Host "kong.yml از روی example کپی شد." -ForegroundColor Green
} else {
    Write-Host "kong.yml از قبل وجود دارد — تغییر نکرد." -ForegroundColor Yellow
}

# --- 14. مراحل بعدی ---
Write-Host ""
Write-Host "=== مراحل بعدی ===" -ForegroundColor Cyan
Write-Host "1) باز کردن پورت‌ها در Firewall (با PowerShell Admin):" -ForegroundColor White
Write-Host "   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\firewall-lan-admin.ps1" -ForegroundColor Gray
Write-Host "2) build و اجرای stack (با PowerShell عادی):" -ForegroundColor White
Write-Host "   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1" -ForegroundColor Gray
Write-Host "3) بررسی سلامت:" -ForegroundColor White
Write-Host "   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\check-lan.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host ("آدرس کاربران شبکه: http://{0}:3000" -f $lanIp) -ForegroundColor Green
Write-Host ""
Write-Host "⚠ deploy/lan/.env.lan را هرگز commit نکنید." -ForegroundColor Yellow