# =============================================================================
# issue-products-api-credential.ps1
# -----------------------------------------------------------------------------
# Issues (or re-issues) the credential for the internal read-only
# products + pricing API added by migration 334.
#
# The credential is an HS256 JWT signed with the stack's JWT_SECRET whose
# "role" claim is the dedicated Postgres role products_api_readonly.
# PostgREST reads that claim and SET ROLEs into it, so the request can only ever
# reach what that role was granted: the two api_* views, nothing else.
#
# The token is NEVER printed and NEVER written inside the repository. It is
# written to a file under the current user's profile, outside any git working
# tree. Re-running this script issues a fresh token and overwrites that file;
# the previous token stays valid until it expires (see -Years) or until the role
# is dropped via docs/verification/334-down.sql.
#
# Usage:
#   pwsh deploy/lan/scripts/issue-products-api-credential.ps1
#   pwsh deploy/lan/scripts/issue-products-api-credential.ps1 -Years 1
# =============================================================================

[CmdletBinding()]
param(
    [string] $EnvFile = (Join-Path $PSScriptRoot "..\.env.lan"),
    [string] $Role    = "products_api_readonly",
    [int]    $Years   = 10,
    [string] $OutFile = (Join-Path $env:USERPROFILE ".afrakala\products-api-credential.txt")
)

$ErrorActionPreference = "Stop"

function ConvertTo-Base64Url([byte[]] $bytes) {
    $b64 = [Convert]::ToBase64String($bytes)
    return ($b64 -replace '\+', '-' -replace '/', '_' -replace '=', '')
}

function Get-EnvValue([string] $file, [string] $key) {
    if (-not (Test-Path $file)) { throw "env file not found: $file" }
    $line = Select-String -Path $file -Pattern ("^{0}=(.*)$" -f [regex]::Escape($key)) | Select-Object -First 1
    if ($null -eq $line) { throw "key '$key' not found in $file" }
    return $line.Matches[0].Groups[1].Value.Trim()
}

function New-SupabaseJwt([string] $role, [string] $secret, [int] $years) {
    $headerObj = [ordered]@{ alg = "HS256"; typ = "JWT" }
    $epoch = New-Object DateTime 1970, 1, 1, 0, 0, 0, ([DateTimeKind]::Utc)
    $iat = [int][math]::Floor(((Get-Date).ToUniversalTime() - $epoch).TotalSeconds)
    $exp = $iat + (60 * 60 * 24 * 365 * $years)
    $payloadObj = [ordered]@{
        role = $role
        iss  = "supabase"
        iat  = $iat
        exp  = $exp
    }

    $enc = [System.Text.Encoding]::UTF8
    $headerB64  = ConvertTo-Base64Url $enc.GetBytes(($headerObj  | ConvertTo-Json -Compress))
    $payloadB64 = ConvertTo-Base64Url $enc.GetBytes(($payloadObj | ConvertTo-Json -Compress))

    $signingInput = "{0}.{1}" -f $headerB64, $payloadB64
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $enc.GetBytes($secret)
    $sigB64 = ConvertTo-Base64Url $hmac.ComputeHash($enc.GetBytes($signingInput))

    return @{ token = ("{0}.{1}" -f $signingInput, $sigB64); exp = $exp }
}

# --- guard: the role must actually exist, or the token would be useless ------
$pgPassword = Get-EnvValue $EnvFile "POSTGRES_PASSWORD"
$pgDb       = Get-EnvValue $EnvFile "POSTGRES_DB"
$roleCheck = docker exec -e PGPASSWORD=$pgPassword afrakala-lan-db `
    psql -U supabase_admin -d $pgDb -tAc "SELECT 1 FROM pg_roles WHERE rolname='$Role'"
if (($roleCheck | Out-String).Trim() -ne "1") {
    throw "Postgres role '$Role' does not exist. Apply migration 334 first."
}

$jwtSecret = Get-EnvValue $EnvFile "JWT_SECRET"
$anonKey   = Get-EnvValue $EnvFile "ANON_KEY"
$apiPort   = Get-EnvValue $EnvFile "SUPABASE_API_PORT"
$lanIp     = Get-EnvValue $EnvFile "LAN_HOST_IP"
if ([string]::IsNullOrWhiteSpace($apiPort)) { $apiPort = "9000" }
if ([string]::IsNullOrWhiteSpace($lanIp))   { $lanIp   = "192.168.170.8" }

$result  = New-SupabaseJwt $Role $jwtSecret $Years
$expDate = (New-Object DateTime 1970, 1, 1, 0, 0, 0, ([DateTimeKind]::Utc)).AddSeconds($result.exp)
$baseUrl = "http://{0}:{1}/rest/v1" -f $lanIp, $apiPort

$outDir = Split-Path -Parent $OutFile
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$content = @"
AfraKala - internal read-only products + pricing API credential
Postgres role : $Role
Issued (UTC)  : $((Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss"))
Expires (UTC) : $($expDate.ToString("yyyy-MM-dd HH:mm:ss"))
Base URL      : $baseUrl

KEEP THIS FILE OUT OF GIT. Anyone holding both values below can read every
product cost and sale price in the system.

APIKEY=$anonKey
TOKEN=$($result.token)

Example:
  curl -s "$baseUrl/api_products_pricing?limit=1" -H "apikey: <APIKEY>" -H "Authorization: Bearer <TOKEN>"
"@

Set-Content -Path $OutFile -Value $content -Encoding UTF8

# Lock the file down to the current user only.
icacls $OutFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

Write-Output "Credential issued for role : $Role"
Write-Output "Token prefix               : $($result.token.Substring(0,12))..."
Write-Output "Expires (UTC)              : $($expDate.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Output "Written to                 : $OutFile"
Write-Output "The token itself was not printed. Read it from the file above."
