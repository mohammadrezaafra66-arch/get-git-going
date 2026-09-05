# ship.ps1 v3 — autonomous commit/push/PR for the test machine
#
# Runs unattended every 15 minutes. Fires only when:
#   1. something actually changed, AND
#   2. nothing has been touched for IdleMinutes, AND
#   3. no risky file is present, AND
#   4. typecheck has no error in a file you touched, and the total has not grown, AND
#   5. the same broken state has not already been reported
#
# Never pushes to a protected branch. Always goes through a feature branch + PR.
#
#   .\ship.ps1 -DryRun -Force   # show what it would do, change nothing
#   .\ship.ps1 -Force           # ship now, skip the idle wait
#   .\ship.ps1 -ResetBaseline   # re-record the typecheck baseline

param(
  [switch]$DryRun,
  [switch]$Force,
  [switch]$ResetBaseline
)

# ── CONFIG ───────────────────────────────────────────────────
$RepoPath      = "D:\AfraKalaTest\app"
$BaseBranch    = "staging"
$Protected     = @("main","staging","master","production")
$IdleMinutes   = 60
$TypecheckCmd  = "npm run typecheck"

# Layer A concurrency guard: hold the ship while another actor's commit is fresh
# on the base branch, and escalate on ELAPSED TIME, not a skip count -- the run
# cadence lives in the Scheduled Task, so a count would silently change meaning if
# the task interval changed. GuardEscalateAfterMinutes is cadence-independent.
$GuardEscalateAfterMinutes = 120
$BlockedFile = Join-Path (Split-Path $RepoPath -Parent) "SHIP-BLOCKED.txt"

# LLM — DeepSeek by default; for OpenAI swap the two lines below
$ApiUrl        = "https://api.deepseek.com/chat/completions"
$ApiModel      = "deepseek-chat"
# $ApiUrl      = "https://api.openai.com/v1/chat/completions"
# $ApiModel    = "gpt-4o-mini"
$ApiKeyEnvVar  = "SHIP_API_KEY"

$MaxDiffChars  = 14000

# Files that must never be auto-committed. Anything matching -> abort and report.
$RiskyPatterns = @(
  '^\.env', '\.env\.', '\.key$', '\.pem$', '\.pfx$',
  '^scratch/', '^scripts/scratch/', '\.bak$', '\.xlsx$', '\.dump$',
  '^test-.*\.sql$', '^r9-.*\.txt$', '^test-objects\.txt$', 'backup.*\.sql$'
)

$StateFile = Join-Path $RepoPath ".ship-state.json"
$LogFile   = Join-Path $RepoPath ".ship.log"
# ─────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
Set-Location $RepoPath

# UTF-8 everywhere: console output, and TLS 1.2 for the API call
try {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $OutputEncoding = [Text.Encoding]::UTF8
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch { }

$Utf8NoBom = New-Object Text.UTF8Encoding $false
function Write-Utf8($path, $text) { [IO.File]::WriteAllText($path, $text, $Utf8NoBom) }

function Log($msg, $level = "INFO") {
  $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $level, $msg
  Add-Content -Path $LogFile -Value $line -Encoding utf8
  if ($level -eq "ERROR") { Write-Host $line -ForegroundColor Red }
  elseif ($level -eq "SHIP") { Write-Host $line -ForegroundColor Green }
  elseif ($level -eq "WARN") { Write-Host $line -ForegroundColor Yellow }
  else { Write-Host $line }
}

# Native commands write normal progress to stderr — git push, git checkout and
# gh all do it. Under $ErrorActionPreference = "Stop" PowerShell 5.1 turns that
# stderr into a terminating error even when the command SUCCEEDED, which once
# killed this script immediately after a good push and left the repo on the
# feature branch with no PR. Run them through here and judge the exit code only.
function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string[]]$Arguments = @(),
    [string]$Label = "",
    [switch]$Quiet
  )
  $ErrorActionPreference = "Continue"
  $out  = @(& $Exe @Arguments 2>&1 | ForEach-Object { "$_" })
  $code = $LASTEXITCODE
  if (-not $Quiet) {
    $tag = if ($Label) { $Label } else { $Exe }
    $out | Where-Object { $_.Trim() -ne "" } | ForEach-Object { Log "    ${tag}: $_" }
  }
  return [pscustomobject]@{ ExitCode = $code; Output = $out }
}

function Load-State {
  if (Test-Path $StateFile) {
    $s = Get-Content $StateFile -Raw | ConvertFrom-Json
  } else {
    $s = [pscustomobject]@{}
  }
  foreach ($p in @('lastFailHash','lastFailAt','lastSeenHead','guardStreakStart')) {
    if ($s.PSObject.Properties.Name -notcontains $p) {
      $s | Add-Member -NotePropertyName $p -NotePropertyValue "" -Force
    }
  }
  if ($s.PSObject.Properties.Name -notcontains 'typecheckBaseline') {
    $s | Add-Member -NotePropertyName typecheckBaseline -NotePropertyValue -1 -Force
  }
  return $s
}
function Save-State($s) { $s | ConvertTo-Json | Set-Content $StateFile -Encoding utf8 }

$state = Load-State
if ($ResetBaseline) {
  $state.typecheckBaseline = -1
  $state.lastFailHash = ""
  Save-State $state
  Log "Baseline reset" "WARN"
}

# ── 1. is there anything to ship? ────────────────────────────
$branch = git rev-parse --abbrev-ref HEAD
if ($Protected -notcontains $branch -and -not $Force) {
  Log "on working branch '$branch' — a previous ship may be unmerged. Skipping." "WARN"
  exit 0
}

$status = git status --porcelain
if (-not $status) { exit 0 }   # nothing changed, stay quiet

$changed = $status | ForEach-Object { ($_ -replace '^..\s+','').Trim('"') }

# -- 1b. capture the OBSERVED file set once, in memory, for scoped staging -------
# $changed (above) still drives the risky/idle/typecheck gates unchanged. For the
# actual `git add` we stage exactly what we observe HERE, so files another agent
# drops into this shared tree during typecheck / the LLM call are never swept in.
# -z is required: NUL-delimited, no core.quotepath octal-escaping of Persian
# names, and a rename arrives as two paths (both staged so it commits intact).
$snapPathFile = Join-Path $env:TEMP ("ship-snap-{0}.bin" -f $PID)   # written later, inside the try
$snapRawFile  = Join-Path $env:TEMP ("ship-rawz-{0}.bin" -f $PID)
& cmd /c "git -C ""$RepoPath"" status --porcelain -z > ""$snapRawFile""" | Out-Null
$shipPaths = New-Object System.Collections.Generic.List[string]
if ((Test-Path $snapRawFile) -and ((Get-Item $snapRawFile).Length -gt 0)) {
  $tokens = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($snapRawFile)) -split "`0"
  $i = 0
  while ($i -lt $tokens.Count) {
    $t = $tokens[$i]
    if ($t.Length -ge 4) {
      $xy = $t.Substring(0,2)
      $p1 = $t.Substring(3)                               # "XY " stripped
      if ($xy.Contains('R') -or $xy.Contains('C')) {      # rename/copy record: TWO NUL fields
        $i++
        $p2 = if ($i -lt $tokens.Count) { $tokens[$i] } else { "" }
        # Add only the side that still exists on disk (the destination). The source
        # of a staged rename is already recorded in the index; re-adding a path gone
        # from the worktree fails with 'pathspec did not match' and aborts the add.
        # Order-independent, and correct for RM (dest modified after the rename).
        foreach ($c in @($p1,$p2)) {
          if ($c -ne "" -and (Test-Path -LiteralPath (Join-Path $RepoPath $c))) { [void]$shipPaths.Add($c) }
        }
      } else {
        [void]$shipPaths.Add($p1)                          # add/mod/delete: one field (deletes match though gone)
      }
    }
    $i++
  }
}
Remove-Item $snapRawFile -Force -ErrorAction SilentlyContinue   # raw consumed; nothing leaks on early exits

# ── 2. risky files? never auto-commit these ──────────────────
$risky = $changed | Where-Object { $p = $_; $RiskyPatterns | Where-Object { $p -match $_ } }
if ($risky) {
  Log "BLOCKED — risky files present, nothing shipped:" "ERROR"
  $risky | ForEach-Object { Log "    $_" "ERROR" }
  Log "Move them out of the repo or add them to .gitignore, then this resumes." "ERROR"
  exit 1
}

# ── 3. idle check ────────────────────────────────────────────
$lastTouch = $changed |
  Where-Object { Test-Path $_ } |
  ForEach-Object { (Get-Item $_).LastWriteTime } |
  Sort-Object -Descending | Select-Object -First 1

if (-not $Force) {
  if (-not $lastTouch) { exit 0 }
  $idle = [int]((Get-Date) - $lastTouch).TotalMinutes
  if ($idle -lt $IdleMinutes) { exit 0 }   # still working, stay quiet
  Log "Idle for $idle min with $($changed.Count) changed files — starting ship"
} else {
  Log "Forced ship with $($changed.Count) changed files"
}

# -- 3b. concurrency guard (Layer A) -- hold while another actor's commit is fresh
# We are otherwise ready to ship. If base HEAD advanced since we last acted AND is
# still fresh, another actor just landed work -- hold off. lastSeenHead means an
# unchanged HEAD (including one we produced or already accounted for) never trips
# this, so the shipper does not stall on its own merge. Escalation is by ELAPSED
# time of the current hold streak, not a count, so it is cadence-independent.
if (-not $Force) {
  $headHash   = (git rev-parse HEAD).Trim()
  $headEpoch  = [int64](git log -1 --format=%ct HEAD)
  $headAgeMin = [int]((Get-Date).ToUniversalTime() - [DateTimeOffset]::FromUnixTimeSeconds($headEpoch).UtcDateTime).TotalMinutes
  $movedByOther = ($state.lastSeenHead -ne "" -and $state.lastSeenHead -ne $headHash)

  if ($movedByOther -and $headAgeMin -lt $IdleMinutes) {
    if ([string]::IsNullOrEmpty($state.guardStreakStart)) {
      $state.guardStreakStart = (Get-Date).ToString("o")   # first hold of this streak
    }
    $streakMin = [int]((Get-Date) - [datetime]::Parse($state.guardStreakStart, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)).TotalMinutes
    Log ("Concurrency guard: base HEAD $($headHash.Substring(0,8)) is $headAgeMin min old and moved " +
         "since our last cycle -- another actor is active. Holding ($streakMin min into this streak).") "WARN"
    if ($streakMin -ge $GuardEscalateAfterMinutes) {
      # Escalation: not a louder log, not a notifier -- one breadcrumb OUTSIDE the
      # repo that the owner sees in the folder. Overwritten in place (idempotent),
      # and removed the moment the guard passes (below), so it never lies.
      Write-Utf8 $BlockedFile (@"
auto-ship has been blocked for ~$streakMin minutes.
Reason: the base branch ($BaseBranch) keeps moving -- another agent/fleet is
committing into this shared tree, so the shipper is holding to avoid sweeping
their work. YOUR $($changed.Count) changed file(s) in $RepoPath are NOT shipped yet.
This clears itself once the base branch is quiet for $IdleMinutes min, or run
  .\scripts\ship.ps1 -Force
to ship now. Last checked: $(Get-Date -Format 'yyyy-MM-dd HH:mm').
"@)
      Log "Concurrency guard has held for $streakMin min (>= $GuardEscalateAfterMinutes) -- wrote $BlockedFile" "ERROR"
    }
    Save-State $state
    exit 0
  }

  # Guard passes: streak over. Account for this HEAD, clear the streak, and remove
  # the breadcrumb so it never reports a block that has already ended.
  $state.lastSeenHead     = $headHash
  $state.guardStreakStart = ""
  Save-State $state
  Remove-Item $BlockedFile -Force -ErrorAction SilentlyContinue
}

# ── 4. don't re-report the same broken state ─────────────────
$hash = (Get-FileHash -InputStream ([IO.MemoryStream]::new(
          [Text.Encoding]::UTF8.GetBytes(($status -join "`n")))) -Algorithm SHA256).Hash
if ($state.lastFailHash -eq $hash -and -not $Force) { exit 0 }

# ── 5. typecheck gate: touched-file rule + ratchet ───────────
Log "Running typecheck"
$tcOutput = & cmd /c "$TypecheckCmd 2>&1"
$errLines = @($tcOutput | Where-Object { $_ -match 'error TS\d+' })
$errCount = $errLines.Count

$errFiles = @($errLines | ForEach-Object {
  if ($_ -match '^(.+?)\(\d+,\d+\)') { $matches[1] -replace '\\','/' }
} | Sort-Object -Unique)

$touchedWithErrors = @($errFiles | Where-Object { $changed -contains $_ })

if ($touchedWithErrors) {
  Log "TYPECHECK FAILED in files you changed — nothing shipped" "ERROR"
  foreach ($f in $touchedWithErrors) {
    ($errLines | Where-Object { $_ -like "$f*" -or $_ -like "*$f(*" } |
      Select-Object -First 6) | ForEach-Object { Log "    $_" "ERROR" }
  }
  $state.lastFailHash = $hash
  $state.lastFailAt   = (Get-Date).ToString("s")
  Save-State $state
  exit 10
}

$baseline = [int]$state.typecheckBaseline
if ($baseline -lt 0) {
  Log "First run — recording typecheck baseline at $errCount pre-existing errors" "WARN"
  $state.typecheckBaseline = $errCount
} elseif ($errCount -gt $baseline) {
  Log "TYPECHECK REGRESSED: $errCount errors vs baseline $baseline — nothing shipped" "ERROR"
  ($errLines | Select-Object -Last 12) | ForEach-Object { Log "    $_" "ERROR" }
  $state.lastFailHash = $hash
  $state.lastFailAt   = (Get-Date).ToString("s")
  Save-State $state
  exit 10
} elseif ($errCount -lt $baseline) {
  Log "Typecheck improved: $errCount errors (was $baseline) — lowering baseline" "SHIP"
  $state.typecheckBaseline = $errCount
}
Save-State $state
Log "Typecheck OK — $errCount pre-existing errors, none in your files"

# ── 6. build the change summary for the model ────────────────
$stat      = (git diff --stat HEAD) -join "`n"
$names     = (git diff --name-status HEAD) -join "`n"
$untracked = ($status | Where-Object { $_ -match '^\?\?' }) -join "`n"

$diff = (git diff HEAD -- . ':(exclude)*.lock' ':(exclude)*lock.json' ':(exclude)*.svg') -join "`n"
$diff = ($diff -split "`n" | Where-Object {
  $_ -notmatch '(?i)(api[_-]?key|secret|password|token|authorization|bearer)\s*[:=]'
}) -join "`n"
if ($diff.Length -gt $MaxDiffChars) {
  $diff = $diff.Substring(0, $MaxDiffChars) + "`n[... diff truncated ...]"
}

$intent = ""
$intentFile = Join-Path $RepoPath ".shipmsg"
if (Test-Path $intentFile) {
  $intent = (Get-Content $intentFile -Raw -Encoding UTF8).Trim()
  Log "Found .shipmsg — using it as stated intent"
}

# ── 7. ask the model for a commit message ────────────────────
$apiKey = [Environment]::GetEnvironmentVariable($ApiKeyEnvVar, "User")
if (-not $apiKey) { $apiKey = $env:SHIP_API_KEY }
$msg = $null

if ($apiKey) {
  $sys = @"
You write git commit messages and pull request descriptions from a diff.
Reply with ONLY a JSON object, no markdown fences, with these keys:
  subject   Conventional Commits, imperative, under 72 chars, English,
            e.g. "feat(treasury): add asan code to bank accounts"
  body      2-4 sentences in Persian describing WHAT changed and its effect.
  pr_title  same as subject
  pr_body   markdown in Persian: a short summary, a bullet list of changes grouped
            by layer, and a "Migrations" section naming any new file under
            supabase/migrations. Omit a layer entirely if it has no changes —
            do not write bullets saying nothing changed. Omit the Migrations
            section if there are none.
Describe only what the diff shows. Never invent a reason, a ticket number, or an effect
you cannot see. If the stated intent is empty, do not speculate about motivation.
"@
  $usr = @"
STATED INTENT (may be empty): $intent

FILES CHANGED:
$names

STATS:
$stat

UNTRACKED:
$untracked

DIFF:
$diff
"@

  try {
    Log "Asking $ApiModel for a commit message"
    $payload = @{
      model    = $ApiModel
      messages = @(
        @{ role = "system"; content = $sys },
        @{ role = "user";   content = $usr }
      )
      temperature = 0.2
    } | ConvertTo-Json -Depth 6

    # Invoke-WebRequest + manual UTF-8 decode.
    # Invoke-RestMethod on PS 5.1 decodes the body as ISO-8859-1 and mangles Persian.
    $r = Invoke-WebRequest -Uri $ApiUrl -Method Post -TimeoutSec 90 -UseBasicParsing `
           -Headers @{ Authorization = "Bearer $apiKey" } `
           -ContentType "application/json; charset=utf-8" `
           -Body ([Text.Encoding]::UTF8.GetBytes($payload))

    $json = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    $resp = $json | ConvertFrom-Json

    $raw = $resp.choices[0].message.content -replace '```json','' -replace '```',''
    $msg = $raw.Trim() | ConvertFrom-Json
  } catch {
    Log "Model call failed: $($_.Exception.Message) — falling back" "WARN"
  }
} else {
  Log "$ApiKeyEnvVar not set — falling back to a generated message" "WARN"
}

if (-not $msg) {
  $areas = ($shipPaths | ForEach-Object { ($_ -split '[\\/]')[0] } | Sort-Object -Unique) -join ", "
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm"
  $msg = [pscustomobject]@{
    subject  = "chore: auto-ship $ts"
    body     = "تغییرات خودکار در: $areas — $($shipPaths.Count) فایل"
    pr_title = "chore: auto-ship $ts"
    pr_body  = "Auto-generated.`n`nFiles changed:`n" + (($shipPaths | ForEach-Object { "- $_" }) -join "`n")
  }
}

# ── 8. commit, push, PR ──────────────────────────────────────
$newBranch = "feature/auto-{0}" -f (Get-Date -Format "yyyyMMdd-HHmm")
$footer  = "`n`nAuto-shipped $(Get-Date -Format 'yyyy-MM-dd HH:mm') from $env:COMPUTERNAME"
$fullMsg = "$($msg.subject)`n`n$($msg.body)$footer"

if ($DryRun) {
  Log "DRY RUN — would create branch $newBranch" "SHIP"
  Write-Host "`n--- commit message ---`n$fullMsg`n"
  Write-Host "--- PR body ---`n$($msg.pr_body)`n"
  exit 0
}

# Commit via a UTF-8 file, not -m: PowerShell mangles non-ASCII arguments to git.exe
$msgFile = Join-Path $env:TEMP "ship-commit-msg.txt"
Write-Utf8 $msgFile $fullMsg

# Once the feature branch exists every exit path must return to $BaseBranch.
# Section 1 refuses to run while a working branch is checked out, so a stranded
# checkout fails silently — it stops every future scheduled run without a word.
# `exit` unwinds through finally, so this covers the failure paths as well.
$branchCreated = $false
$prUrl = ""

try {
  $r = Invoke-Native git @("checkout", "-b", $newBranch) -Label "git"
  if ($r.ExitCode -ne 0) {
    Log "BRANCH CREATE FAILED (exit $($r.ExitCode)) — nothing shipped" "ERROR"
    exit 21
  }
  $branchCreated = $true

  # Stage EXACTLY the observed set (Section 1b), never the whole tree. -A still
  # means adds+mods+deletions, but restricted to the pathspec file, so a deletion
  # in $shipPaths stages as a removal and nothing that appeared AFTER our snapshot
  # (another agent's work) is touched.
  [IO.File]::WriteAllText($snapPathFile, ($shipPaths -join "`0"), (New-Object Text.UTF8Encoding $false))
  $r = Invoke-Native git @("add","-A","--pathspec-from-file=$snapPathFile","--pathspec-file-nul") -Label "git"
  if ($r.ExitCode -ne 0) {
    Log "GIT ADD FAILED (exit $($r.ExitCode)) — nothing shipped" "ERROR"
    exit 22
  }

  $r = Invoke-Native git @("-c", "i18n.commitEncoding=utf-8", "commit", "-F", $msgFile) -Label "git"
  if ($r.ExitCode -ne 0) {
    Log "COMMIT FAILED (exit $($r.ExitCode)) — nothing shipped" "ERROR"
    exit 23
  }

  $r = Invoke-Native git @("push", "-u", "origin", $newBranch) -Label "git"
  if ($r.ExitCode -ne 0) {
    Log "PUSH FAILED (exit $($r.ExitCode)) — the commit is on $newBranch locally, push it by hand" "ERROR"
    exit 20
  }

  if (Get-Command gh -ErrorAction SilentlyContinue) {
    $bodyFile = Join-Path $env:TEMP "ship-pr-body.md"
    Write-Utf8 $bodyFile $msg.pr_body
    $r = Invoke-Native gh @("pr", "create", "--base", $BaseBranch, "--head", $newBranch,
                            "--title", $msg.pr_title, "--body-file", $bodyFile) -Label "gh"
    Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue

    if ($r.ExitCode -ne 0) {
      Log "gh pr create failed (exit $($r.ExitCode)) — the branch is pushed, open the PR by hand" "WARN"
    } else {
      $urlLine = $r.Output | Where-Object { $_ -match '^\s*https?://' } | Select-Object -Last 1
      if ($urlLine) { $prUrl = $urlLine.Trim() }
    }
  }

  if (-not $prUrl) {
    $repo = (git config --get remote.origin.url) -replace '\.git$', ''
    $prUrl = "$repo/pull/new/$newBranch"
  }
}
finally {
  Remove-Item $msgFile -Force -ErrorAction SilentlyContinue
  Remove-Item $snapPathFile -Force -ErrorAction SilentlyContinue   # scoped-add pathspec temp; would leak on every post-branch failure path otherwise
  if ($branchCreated) {
    $back = Invoke-Native git @("checkout", $BaseBranch) -Label "git"
    if ($back.ExitCode -ne 0) {
      Log "COULD NOT RETURN TO $BaseBranch — repo left on $newBranch, fix it by hand" "ERROR"
    }
  }
}

if (Test-Path $intentFile) { Remove-Item $intentFile }

$state.lastFailHash     = ""
$state.guardStreakStart = ""
$state.lastSeenHead     = (git rev-parse HEAD).Trim()   # base HEAD we shipped from
Remove-Item $BlockedFile -Force -ErrorAction SilentlyContinue   # a ship happened -- no longer blocked
Save-State $state

Log "SHIPPED  $($msg.subject)" "SHIP"
Log "         branch: $newBranch  |  files: $($changed.Count)" "SHIP"
Log "         PR: $prUrl" "SHIP"
