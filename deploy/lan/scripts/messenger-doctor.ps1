# messenger-doctor.ps1
# Read-only diagnostic for the AfraKala LAN messenger stack.
# - No secret values are ever printed (only SET / MISSING).
# - No data is modified.
# - No containers or volumes are recreated.
# Compatible with Windows PowerShell 5.1. ASCII-only on purpose.

[CmdletBinding()]
param(
    [string]$ComposeFile = "deploy\lan\docker-compose.yml",
    [string]$WebService  = "web",
    [string]$DbService   = "db"
)

$ErrorActionPreference = "Continue"
$script:Results = New-Object System.Collections.ArrayList

function Add-Result {
    param(
        [string]$Check,
        [ValidateSet("PASS","FAIL","WARN","INFO")]
        [string]$Status,
        [string]$Detail = ""
    )
    [void]$script:Results.Add([pscustomobject]@{
        Check  = $Check
        Status = $Status
        Detail = $Detail
    })
    $color = switch ($Status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        "WARN" { "Yellow" }
        default { "Gray" }
    }
    Write-Host ("[{0}] {1}" -f $Status, $Check) -ForegroundColor $color
    if ($Detail) { Write-Host "        $Detail" -ForegroundColor DarkGray }
}

function Invoke-InWeb {
    param([string]$Command)
    # Run a shell command inside the web container and return its stdout.
    # stderr is folded in via 2>&1 so callers can grep for it.
    return (& docker compose -f $ComposeFile exec -T $WebService sh -lc $Command 2>&1)
}

function Invoke-Psql {
    param([string]$Sql)
    # POSTGRES_PASSWORD is read from the container env; nothing is echoed.
    $cmd = 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc ' + ("'{0}'" -f ($Sql -replace "'", "''"))
    return (& docker compose -f $ComposeFile exec -T $DbService sh -lc $cmd 2>&1)
}

Write-Host ""
Write-Host "AfraKala LAN Messenger Doctor" -ForegroundColor Cyan
Write-Host "-----------------------------" -ForegroundColor Cyan
Write-Host "Compose file : $ComposeFile"
Write-Host "Web service  : $WebService"
Write-Host "DB service   : $DbService"
Write-Host ""

# ---------------------------------------------------------------------------
# 1) Docker + container status
# ---------------------------------------------------------------------------
try {
    $dockerVer = (& docker version --format '{{.Server.Version}}' 2>&1) -join ""
    if ($LASTEXITCODE -eq 0) {
        Add-Result "docker daemon" "PASS" "server $dockerVer"
    } else {
        Add-Result "docker daemon" "FAIL" "docker not reachable"
    }
} catch {
    Add-Result "docker daemon" "FAIL" $_.Exception.Message
}

try {
    $ps = & docker compose -f $ComposeFile ps --format "{{.Service}}`t{{.State}}" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Add-Result "compose ps" "PASS"
        $ps | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }
    } else {
        Add-Result "compose ps" "FAIL" ($ps -join " | ")
    }
} catch {
    Add-Result "compose ps" "FAIL" $_.Exception.Message
}

# ---------------------------------------------------------------------------
# 2) Node runtime + WebSocket presence inside the web container
# ---------------------------------------------------------------------------
$nodeVer = (Invoke-InWeb "node -v") -join ""
if ($nodeVer -match "^v(\d+)\.") {
    $major = [int]$Matches[1]
    if ($major -ge 22) {
        Add-Result "web node runtime" "PASS" $nodeVer.Trim()
    } else {
        Add-Result "web node runtime" "WARN" "$($nodeVer.Trim()) - native WebSocket not global; requires NoopRealtimeTransport in server Supabase clients"
    }
} else {
    Add-Result "web node runtime" "FAIL" ($nodeVer.Trim())
}

$wsProbe = (Invoke-InWeb "node -e ""console.log(typeof WebSocket)""") -join ""
Add-Result "web typeof WebSocket" "INFO" $wsProbe.Trim()

# ---------------------------------------------------------------------------
# 3) Env presence (SET / MISSING only - never print values)
# ---------------------------------------------------------------------------
$envNames = @(
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "OLLAMA_API_URL",
    "OLLAMA_MODEL",
    "OLLAMA_EMBED_MODEL",
    "WHISPER_API_URL",
    "WHISPER_MODEL"
)
foreach ($name in $envNames) {
    $probe = (Invoke-InWeb ("test -n `"`$$name`" && echo SET || echo MISSING")) -join ""
    $probe = $probe.Trim()
    if ($probe -eq "SET") {
        Add-Result "env $name" "PASS" "SET"
    } elseif ($probe -eq "MISSING") {
        $sev = if ($name -like "SUPABASE_*") { "FAIL" } else { "WARN" }
        Add-Result "env $name" $sev "MISSING"
    } else {
        Add-Result "env $name" "WARN" $probe
    }
}

# ---------------------------------------------------------------------------
# 4) Health endpoints (in-container, no external network needed)
# ---------------------------------------------------------------------------
$healthProbes = @(
    @{ Name = "web /";               Cmd = "wget -q -S -O /dev/null http://127.0.0.1:3000/ 2>&1 | head -1" },
    @{ Name = "kong auth /health";   Cmd = "wget -q -S -O /dev/null http://kong:8000/auth/v1/health 2>&1 | head -1" },
    @{ Name = "kong storage /status";Cmd = "wget -q -S -O /dev/null http://kong:8000/storage/v1/status 2>&1 | head -1" }
)
foreach ($h in $healthProbes) {
    $out = (Invoke-InWeb $h.Cmd) -join ""
    if ($out -match "200") {
        Add-Result $h.Name "PASS" $out.Trim()
    } elseif ($out -match "\d{3}") {
        Add-Result $h.Name "WARN" $out.Trim()
    } else {
        Add-Result $h.Name "FAIL" $out.Trim()
    }
}

# ---------------------------------------------------------------------------
# 5) Ollama reachability from inside the web container (status only)
# ---------------------------------------------------------------------------
$ollamaProbe = (Invoke-InWeb 'if [ -z "$OLLAMA_API_URL" ]; then echo NO_URL; else wget -q -S -O /dev/null "$OLLAMA_API_URL/api/tags" 2>&1 | head -1; fi') -join ""
$ollamaProbe = $ollamaProbe.Trim()
if ($ollamaProbe -eq "NO_URL") {
    Add-Result "ollama /api/tags" "WARN" "OLLAMA_API_URL not set"
} elseif ($ollamaProbe -match "200") {
    Add-Result "ollama /api/tags" "PASS" $ollamaProbe
} else {
    Add-Result "ollama /api/tags" "FAIL" $ollamaProbe
}

# ---------------------------------------------------------------------------
# 6) Recent web logs for known error patterns
# ---------------------------------------------------------------------------
try {
    $rawLogs = & docker compose -f $ComposeFile logs --tail 300 --no-color $WebService 2>&1
    $patterns = @(
        "native WebSocket",
        "HTTPError",
        "semantic-search",
        "ollama",
        "ai-chat",
        "storage",
        "Unauthorized",
        "Forbidden"
    )
    foreach ($pat in $patterns) {
        $hits = $rawLogs | Select-String -SimpleMatch -Pattern $pat
        if ($hits) {
            Add-Result "web log: $pat" "WARN" ("{0} match(es); last: {1}" -f $hits.Count, ($hits[-1].Line.Trim()))
        } else {
            Add-Result "web log: $pat" "PASS" "no matches in last 300 lines"
        }
    }
} catch {
    Add-Result "web logs" "FAIL" $_.Exception.Message
}

# ---------------------------------------------------------------------------
# 7) Read-only DB inventory
# ---------------------------------------------------------------------------
$dbChecks = @(
    @{ Name = "table messenger_groups";        Sql = "SELECT to_regclass('public.messenger_groups')::text;" },
    @{ Name = "table messenger_group_members"; Sql = "SELECT to_regclass('public.messenger_group_members')::text;" },
    @{ Name = "table messenger_messages";      Sql = "SELECT to_regclass('public.messenger_messages')::text;" },
    @{ Name = "table messenger_attachments";   Sql = "SELECT to_regclass('public.messenger_attachments')::text;" },
    @{ Name = "table message_embeddings";      Sql = "SELECT to_regclass('public.message_embeddings')::text;" },
    @{ Name = "table delivery_receipts";       Sql = "SELECT to_regclass('public.delivery_receipts')::text;" }
)
foreach ($c in $dbChecks) {
    $out = (Invoke-Psql $c.Sql) -join ""
    $out = $out.Trim()
    if ($out -and $out -notmatch "^ERROR" -and $out -ne "") {
        Add-Result $c.Name "PASS" $out
    } else {
        Add-Result $c.Name "FAIL" $out
    }
}

# Policies snapshot per table (names only, not definitions)
$policyTables = @("messenger_groups","messenger_group_members","messenger_messages","messenger_attachments","message_embeddings","delivery_receipts","delivery_receipt_status_history")
foreach ($t in $policyTables) {
    $sql = "SELECT policyname||'|'||cmd||'|'||coalesce(array_to_string(roles,','),'') FROM pg_policies WHERE schemaname='public' AND tablename='$t' ORDER BY policyname;"
    $out = (Invoke-Psql $sql) -join "`n"
    if ($out.Trim()) {
        Add-Result "policies: $t" "INFO"
        $out.Trim().Split("`n") | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }
    } else {
        Add-Result "policies: $t" "WARN" "no policies (or table missing)"
    }
}

# Function inventory (names + prosecdef only)
$fnNames = @("send_messenger_message","send_messenger_message_with_attachment","create_delivery_receipt","is_messenger_group_admin","update_messenger_group_member_role")
foreach ($fn in $fnNames) {
    $sql = "SELECT proname||'|secdef='||prosecdef::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='$fn';"
    $out = (Invoke-Psql $sql) -join "`n"
    if ($out.Trim()) {
        Add-Result "function $fn" "PASS" $out.Trim()
    } else {
        Add-Result "function $fn" "WARN" "not present"
    }
}

# Embeddings table stats
$embRows = (Invoke-Psql "SELECT count(*)::text FROM public.message_embeddings;") -join ""
Add-Result "message_embeddings rows" "INFO" $embRows.Trim()

$embDim = (Invoke-Psql "SELECT a.atttypmod::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='message_embeddings' AND a.attname='embedding';") -join ""
Add-Result "message_embeddings vector typmod" "INFO" $embDim.Trim()

# Storage buckets + object policies
$bucketList = (Invoke-Psql "SELECT id FROM storage.buckets WHERE id IN ('messenger-attachments','delivery-receipts') ORDER BY id;") -join "`n"
if ($bucketList.Trim()) {
    Add-Result "storage buckets" "PASS" ($bucketList.Trim() -replace "`n", ", ")
} else {
    Add-Result "storage buckets" "FAIL" "expected buckets not found"
}

$objPolicies = (Invoke-Psql "SELECT policyname||'|'||cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname;") -join "`n"
if ($objPolicies.Trim()) {
    Add-Result "storage.objects policies" "INFO"
    $objPolicies.Trim().Split("`n") | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }
} else {
    Add-Result "storage.objects policies" "WARN" "no policies"
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "-------" -ForegroundColor Cyan
$byStatus = $script:Results | Group-Object Status | Sort-Object Name
foreach ($g in $byStatus) {
    Write-Host ("  {0,-4} : {1}" -f $g.Name, $g.Count)
}
$fail = ($script:Results | Where-Object { $_.Status -eq "FAIL" }).Count
if ($fail -gt 0) { exit 1 } else { exit 0 }