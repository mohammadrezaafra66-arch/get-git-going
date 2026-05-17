# validate-kong-lan.ps1
# AfraKala — LAN Kong/PostgREST authentication validator.
# ASCII-only. Compatible with Windows PowerShell 5.1.
#
# Verifies that:
#  1) deploy/lan/.env.lan is a real env file (not accidentally a JS file)
#  2) Required keys exist and are internally consistent
#  3) The running kong container has ANON/SERVICE keys matching .env.lan
#  4) Kong gateway accepts SERVICE_ROLE_KEY and ANON_KEY against /rest/v1
#  5) /auth/v1/health returns 200
# Prints clear Persian diagnostics on failure. Exits non-zero on any failure.

$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lanDir    = Resolve-Path (Join-Path $scriptDir "..")
$envFile   = Join-Path $lanDir ".env.lan"

$fail = 0
function Fail([string]$msg) {
    Write-Host ("[FAIL] " + $msg) -ForegroundColor Red
    $script:fail++
}
function Ok([string]$msg) {
    Write-Host ("[ OK ] " + $msg) -ForegroundColor Green
}
function Info([string]$msg) {
    Write-Host ("[INFO] " + $msg) -ForegroundColor Cyan
}

# --- 1. .env.lan must exist and be a real env file ---
if (-not (Test-Path $envFile)) {
    Fail "فایل deploy/lan/.env.lan پیدا نشد. ابتدا init-lan.ps1 را اجرا کنید."
    exit 1
}

$envText = Get-Content -Raw -Path $envFile
$jsMarkers = @('import {', 'createServer', 'node:http', 'const __dirname', '// Minimal Node.js adapter')
foreach ($m in $jsMarkers) {
    if ($envText -match [regex]::Escape($m)) {
        Fail (".env.lan شامل محتوای JavaScript است (نشانه: '{0}'). فایل احتمالاً توسط یک اسکریپت اشتباه overwrite شده." -f $m)
    }
}
if ($fail -gt 0) { exit 1 }

function Get-EnvValue([string]$key) {
    $line = Select-String -Path $envFile -Pattern ("^\s*{0}=(.*)$" -f [regex]::Escape($key)) | Select-Object -First 1
    if (-not $line) { return $null }
    return $line.Matches.Groups[1].Value.Trim().Trim('"').Trim("'")
}

$required = @('JWT_SECRET','ANON_KEY','SERVICE_ROLE_KEY','VITE_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','LAN_HOST_IP')
$values = @{}
foreach ($k in $required) {
    $v = Get-EnvValue $k
    if ([string]::IsNullOrWhiteSpace($v)) {
        Fail ("متغیر {0} در .env.lan خالی یا تعریف نشده است." -f $k)
    } else {
        $values[$k] = $v
        Ok ("متغیر {0} موجود است." -f $k)
    }
}
if ($fail -gt 0) { exit 1 }

# --- 2. Internal consistency ---
if ($values['ANON_KEY'] -ne $values['VITE_SUPABASE_PUBLISHABLE_KEY']) {
    Fail "ANON_KEY با VITE_SUPABASE_PUBLISHABLE_KEY برابر نیست. این دو باید یکی باشند."
} else {
    Ok "ANON_KEY == VITE_SUPABASE_PUBLISHABLE_KEY"
}
if ($values['SERVICE_ROLE_KEY'] -ne $values['SUPABASE_SERVICE_ROLE_KEY']) {
    Fail "SERVICE_ROLE_KEY با SUPABASE_SERVICE_ROLE_KEY برابر نیست."
} else {
    Ok "SERVICE_ROLE_KEY == SUPABASE_SERVICE_ROLE_KEY"
}

# --- 3. Inspect running kong container ---
$kongName = "afrakala-lan-kong"
$kongRunning = $false
try {
    $state = docker inspect -f '{{.State.Running}}' $kongName 2>$null
    if ($state -eq 'true') { $kongRunning = $true }
} catch {}

if (-not $kongRunning) {
    Fail ("کانتینر {0} در حال اجرا نیست. ابتدا docker compose up -d انجام دهید." -f $kongName)
} else {
    Ok ("کانتینر {0} در حال اجرا است." -f $kongName)

    $kongAnon    = (docker exec $kongName sh -c 'printf %s "$SUPABASE_ANON_KEY"' 2>$null)
    $kongService = (docker exec $kongName sh -c 'printf %s "$SUPABASE_SERVICE_KEY"' 2>$null)

    if ($kongAnon -ne $values['ANON_KEY']) {
        Fail "SUPABASE_ANON_KEY داخل kong با ANON_KEY در .env.lan برابر نیست. کانتینر را با --force-recreate دوباره بسازید."
    } else { Ok "SUPABASE_ANON_KEY داخل kong = ANON_KEY" }

    if ($kongService -ne $values['SERVICE_ROLE_KEY']) {
        Fail "SUPABASE_SERVICE_KEY داخل kong با SERVICE_ROLE_KEY در .env.lan برابر نیست. کانتینر را با --force-recreate دوباره بسازید."
    } else { Ok "SUPABASE_SERVICE_KEY داخل kong = SERVICE_ROLE_KEY" }

    # Verify the rendered kong.yml has expanded placeholders, not literal '$SUPABASE_ANON_KEY'
    $rendered = docker exec $kongName sh -c 'cat /home/kong/kong.yml 2>/dev/null || cat /var/lib/kong/kong.yml 2>/dev/null' 2>$null
    if ($rendered -match '\$SUPABASE_ANON_KEY' -or $rendered -match '\$SUPABASE_SERVICE_KEY') {
        Fail "kong.yml داخل کانتینر هنوز شامل placeholderهای \$SUPABASE_ANON_KEY / \$SUPABASE_SERVICE_KEY است. entrypoint envsubst اعمال نشده — docker-compose.yml بخش kong را به‌روزرسانی کرده و --force-recreate کنید."
    } else {
        Ok "kong.yml داخل کانتینر، placeholderهای env را جایگزین کرده است."
    }
}

# --- 4. HTTP tests against the gateway ---
$lanIp = $values['LAN_HOST_IP']
$apiPort = Get-EnvValue 'SUPABASE_API_PORT'
if ([string]::IsNullOrWhiteSpace($apiPort)) { $apiPort = '8000' }
$base = "http://{0}:{1}" -f $lanIp, $apiPort

function Invoke-Json([string]$url, [hashtable]$headers) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $url -Headers $headers -ErrorAction Stop
        return @{ ok = $true; status = [int]$r.StatusCode; body = $r.Content }
    } catch {
        $resp = $_.Exception.Response
        $status = if ($resp) { [int]$resp.StatusCode } else { 0 }
        $body = ""
        try {
            if ($resp) {
                $s = $resp.GetResponseStream()
                $sr = New-Object System.IO.StreamReader($s)
                $body = $sr.ReadToEnd()
            }
        } catch {}
        return @{ ok = $false; status = $status; body = $body; error = $_.Exception.Message }
    }
}

# 4a. auth health
$h = Invoke-Json ("{0}/auth/v1/health" -f $base) @{}
if ($h.ok -and $h.status -eq 200) {
    Ok ("/auth/v1/health پاسخ 200 داد.")
} else {
    Fail ("/auth/v1/health پاسخ نامعتبر داد. status={0} body={1}" -f $h.status, $h.body)
}

# 4b. REST with SERVICE_ROLE_KEY (must NOT be rejected by Kong)
$svc = $values['SERVICE_ROLE_KEY']
$rs = Invoke-Json ("{0}/rest/v1/profiles?select=id&limit=1" -f $base) @{ 'apikey' = $svc; 'Authorization' = ("Bearer {0}" -f $svc) }
if ($rs.body -match 'Invalid authentication credentials') {
    Fail "Kong هنوز SERVICE_ROLE_KEY را رد می‌کند (Invalid authentication credentials). یعنی kong.yml هنوز placeholder دارد یا key-auth با کلید درست تطابق ندارد."
} elseif ($rs.ok -and ($rs.status -eq 200)) {
    Ok "/rest/v1/profiles با SERVICE_ROLE_KEY پاسخ 200 داد."
} else {
    Fail ("/rest/v1/profiles با SERVICE_ROLE_KEY ناموفق. status={0} body={1}" -f $rs.status, $rs.body)
}

# 4c. REST with ANON_KEY (Kong should accept; PostgREST may return [] due to RLS — that's fine)
$an = $values['ANON_KEY']
$ra = Invoke-Json ("{0}/rest/v1/profiles?select=id&limit=1" -f $base) @{ 'apikey' = $an; 'Authorization' = ("Bearer {0}" -f $an) }
if ($ra.body -match 'Invalid authentication credentials') {
    Fail "Kong هنوز ANON_KEY را رد می‌کند (Invalid authentication credentials)."
} else {
    Ok ("/rest/v1/profiles با ANON_KEY از gateway عبور کرد (status={0})." -f $ra.status)
}

if ($fail -gt 0) {
    Write-Host ""
    Write-Host ("نتیجه: {0} خطا. لطفاً موارد بالا را رفع کنید." -f $fail) -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "همه بررسی‌ها موفق بود. مسیر احراز هویت LAN سالم است." -ForegroundColor Green
    exit 0
}