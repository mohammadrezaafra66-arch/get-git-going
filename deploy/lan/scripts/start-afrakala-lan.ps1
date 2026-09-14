<#
.SYNOPSIS
  Bring the AfraKala LAN stack up after logon/reboot WITHOUT changing what runs,
  and fail loudly if the web container would run without its runtime settings.

.DESCRIPTION
  Replaces the 2026-05-27 version (see git history). Measured 2026-09-13/14:
    - The old script hardcoded C:\AfraKalaServer\get-git-going01lan three times
      (cd, compose, status file). That tree's compose declares only 8 web
      environment keys, so `up -d` from it recreates afrakala-lan-web without
      OLLAMA_*, WHATSAPP_*, MARKETING_TASKS_WORKER_TOKEN, ISSABEL_* and
      APP_SUPABASE_PUBLIC_URL - and /api/healthz stays green.
      Here every path is derived from this file's own location
      (<checkout>\deploy\lan\scripts), so the script always drives the compose
      file of the checkout it lives in. No tree path appears in this file.
    - The old `up -d` had no --no-deps. `web` -> kong, and auth/rest/storage/meta
      -> db-role-fix, so a plain up pulls the one-shot db-role-fix into the start
      graph (the failure mode recorded in CLAUDE.md, where it took the app down).
      Here: --no-deps with an explicit service list.
    - The canonical compose also defines `caddy` (443, not running on this host)
      and two extra kong settings. A plain `up -d` from it would start a new
      proxy and recreate kong. Here: explicit list (caddy excluded) and
      --no-recreate, so a reboot only STARTS existing containers and creates
      missing ones; it never replaces a running definition. Changing what runs
      is a deploy, and deploys have their own documented command.
    - The old task ran without -NoProfile. This script records whether it was
      started with -NoProfile, and warns in the status file if not.
    - The old status file went to a hardcoded path. Here it is written next to
      this script: last-autostart-status.txt (git-ignored).

  Checks, in order; any failure is a non-zero exit and a FAIL line in the status file:
    1. docker engine answers within -DockerWaitSeconds          (exit 10)
    2. compose file and .env.lan exist next to this checkout      (exit 11)
    3. the RESOLVED compose config gives `web` every required key (exit 20)
       - if not, `up` is not run at all
    4. docker compose up -d --no-deps --no-recreate <services>    (exit 21)
    5. the RUNNING afrakala-lan-web carries every required key    (exit 30)
       - catches a web container created earlier from another tree
    6. /api/healthz answers 200 within -HealthWaitSeconds         (exit 40)

  Only key NAMES are ever checked or written. No value is printed.
  ASCII only on purpose: Windows PowerShell 5.1 reads a BOM-less file as ANSI.

.NOTES
  Install as (see docs/runbooks/backup-and-autostart-20260914.md):
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "<checkout>\deploy\lan\scripts\start-afrakala-lan.ps1"
  -PlanOnly runs checks 1-3 and 5 and prints the up command; it runs no compose up.
#>
[CmdletBinding()]
param(
    [int]$DockerWaitSeconds = 300,
    [int]$HealthWaitSeconds = 180,
    [switch]$PlanOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$ScriptDir = $PSScriptRoot
$LanDir = Split-Path -Path $ScriptDir -Parent
$ComposeFile = Join-Path $LanDir 'docker-compose.yml'
$EnvFile = Join-Path $LanDir '.env.lan'
$StatusFile = Join-Path $ScriptDir 'last-autostart-status.txt'

# db-role-fix (one-shot), studio (profile) and caddy (not deployed here) are deliberately absent.
$Services = @('db', 'kong', 'auth', 'rest', 'storage', 'meta', 'web')
$WebContainer = 'afrakala-lan-web'
$RequiredWebKeys = @(
    'OLLAMA_API_URL', 'OLLAMA_API_KEY', 'OLLAMA_MODEL', 'OLLAMA_EMBED_MODEL', 'OLLAMA_VISION_MODEL',
    'WHATSAPP_PLATFORM_BASE_URL', 'WHATSAPP_TOP_PRODUCTS_LIMIT',
    'MARKETING_TASKS_WORKER_TOKEN',
    'ISSABEL_CDR_HOST', 'ISSABEL_CDR_PORT', 'ISSABEL_CDR_USER', 'ISSABEL_CDR_PASSWORD', 'ISSABEL_CDR_DB', 'ISSABEL_IMPORT_WORKER_TOKEN',
    'APP_SUPABASE_PUBLIC_URL',
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OCR_ENABLED'
)

$script:Lines = New-Object System.Collections.Generic.List[string]
$script:Warnings = 0

function Write-Log {
    param([string]$Text)
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Text
    $script:Lines.Add($line)
    Write-Host $line
}

function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    return [pscustomobject]@{ Code = $code; Output = @($out) }
}

function Stop-Autostart {
    param([int]$Code, [string]$Summary)
    Write-Log "EXIT $Code - $Summary"
    $ps = Invoke-Native 'docker' @('ps', '-a', '--filter', 'name=afrakala-lan', '--format', 'table {{.Names}}\t{{.Status}}\t{{.Ports}}')
    $header = @(
        "result       : $Summary",
        "exit code    : $Code",
        "warnings     : $script:Warnings",
        "finished     : $(Get-Date -Format o)",
        "plan only    : $PlanOnly",
        "script       : $PSCommandPath",
        "compose file : $ComposeFile",
        ''
    )
    $body = $header + $script:Lines + '' + '--- docker ps (afrakala-lan-*) ---' + $ps.Output
    if (-not $PlanOnly) {
        try { Set-Content -LiteralPath $StatusFile -Value $body -Encoding ASCII } catch { Write-Host "could not write $StatusFile : $($_.Exception.Message)" }
    }
    exit $Code
}

function Get-MissingKeys {
    param([string[]]$Present)
    return @($RequiredWebKeys | Where-Object { $Present -notcontains $_ })
}

try {
    Write-Log "AfraKala LAN autostart. PlanOnly=$PlanOnly"
    Write-Log "checkout lan dir: $LanDir"

    if ([Environment]::CommandLine -notmatch '(?i)-NoProfile') {
        $script:Warnings++
        Write-Log 'WARN: not started with -NoProfile; a user profile may have altered this session'
    }

    # ---- 1. docker engine --------------------------------------------------------
    $deadline = (Get-Date).AddSeconds($DockerWaitSeconds)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        $info = Invoke-Native 'docker' @('info', '--format', '{{.ServerVersion}}')
        if ($info.Code -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 5
    }
    if (-not $ready) { Stop-Autostart 10 "docker engine did not answer within $DockerWaitSeconds s" }
    Write-Log "docker engine ready: $(($info.Output -join ' ').Trim())"

    # ---- 2. files ----------------------------------------------------------------
    if (-not (Test-Path -LiteralPath $ComposeFile)) { Stop-Autostart 11 "missing $ComposeFile" }
    if (-not (Test-Path -LiteralPath $EnvFile)) { Stop-Autostart 11 "missing $EnvFile" }

    $composeArgs = @('compose', '--env-file', $EnvFile, '-f', $ComposeFile)

    # ---- 3. resolved config must declare every required web key -----------------
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    # Render only `web`: less to parse, and PS 5.1 ConvertFrom-Json rejects keys differing only by case.
    $json = & docker @($composeArgs + @('config', '--format', 'json', 'web')) 2>$null
    $cfgCode = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($cfgCode -ne 0) { Stop-Autostart 20 "docker compose config exit $cfgCode" }
    $cfg = ($json -join "`n") | ConvertFrom-Json
    $json = $null
    $declared = @($cfg.services.web.environment.PSObject.Properties | ForEach-Object { $_.Name })
    $cfg = $null
    $missingDeclared = @(Get-MissingKeys -Present $declared)
    if ($missingDeclared.Count -gt 0) {
        Stop-Autostart 20 ("compose config does not give web these keys, so up was NOT run: " + ($missingDeclared -join ', '))
    }
    Write-Log "compose config declares all $($RequiredWebKeys.Count) required web keys"

    # ---- 4. up, without deps, without replacing anything that exists ------------
    $upArgs = $composeArgs + @('up', '-d', '--no-deps', '--no-recreate') + $Services
    Write-Log ("command: docker " + ($upArgs -join ' '))
    if ($PlanOnly) {
        Write-Log 'PLAN: compose up skipped'
    } else {
        $up = Invoke-Native 'docker' $upArgs
        foreach ($l in $up.Output) { if ($l) { Write-Log "  compose: $l" } }
        if ($up.Code -ne 0) { Stop-Autostart 21 "docker compose up exit $($up.Code)" }
    }

    # ---- 5. the running web container must carry every required key ------------
    $envNames = Invoke-Native 'docker' @('inspect', $WebContainer, '--format', '{{range .Config.Env}}{{println .}}{{end}}')
    if ($envNames.Code -ne 0) { Stop-Autostart 30 "docker inspect $WebContainer exit $($envNames.Code)" }
    $present = @($envNames.Output | Where-Object { $_ -match '=' } | ForEach-Object { $_.Substring(0, $_.IndexOf('=')) })
    $envNames = $null
    $missingRunning = @(Get-MissingKeys -Present $present)
    if ($missingRunning.Count -gt 0) {
        Stop-Autostart 30 ("$WebContainer is running WITHOUT: " + ($missingRunning -join ', ') + ". It was created from another compose tree; redeploy web with the documented deploy command.")
    }
    Write-Log "$WebContainer carries all $($RequiredWebKeys.Count) required keys (names checked, values not read)"

    # ---- 6. health ------------------------------------------------------------------
    $deadline = (Get-Date).AddSeconds($HealthWaitSeconds)
    $status = ''
    while ((Get-Date) -lt $deadline) {
        $h = Invoke-Native 'curl.exe' @('-s', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '5', 'http://127.0.0.1:3000/api/healthz')
        $status = ($h.Output -join '').Trim()
        if ($status -eq '200') { break }
        if ($PlanOnly) { break }
        Start-Sleep -Seconds 5
    }
    if ($status -ne '200') { Stop-Autostart 40 "/api/healthz answered '$status', not 200" }
    Write-Log '/api/healthz 200'

    if ($script:Warnings -gt 0) {
        Stop-Autostart 0 "OK with $script:Warnings warning(s)"
    }
    Stop-Autostart 0 'OK'
} catch {
    Write-Log "UNEXPECTED: $($_.Exception.Message) at line $($_.InvocationInfo.ScriptLineNumber)"
    Stop-Autostart 99 'unexpected error'
}
