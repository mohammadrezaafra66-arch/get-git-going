# Backup and autostart on the production laptop: install runbook

**Host:** production laptop `192.168.170.10`, checkout `C:\afrakala`, database `postgres`.
**Written:** 2026-09-14 · **Branch:** `feature/backup-autostart-fix`
**Status:** WRITTEN, NOT APPLIED. When this was committed, no scheduled task had been changed, no
backup had been run, no compose or `.env.lan` file had been edited, and nothing had been restarted.

Scripts this runbook installs:

| file | replaces | task that will run it |
|---|---|---|
| `deploy/lan/scripts/AfraKala-AutoBackup.ps1` | the 2026-06-14 file of the same name (old copy is in git history at `9bc8d554` and still in `C:\AfraKalaServer\get-git-going01lan`) | `AfraKala Auto Backup` |
| `deploy/lan/scripts/start-afrakala-lan.ps1` | the 2026-05-27 file of the same name (same) | `AfraKala LAN Auto Start` |

Run every block in an **elevated Windows PowerShell 5.1** window. PowerShell 5.1 has no `&&`,
`||`, ternary or `??`, and nothing below uses them. Do one block at a time. If a block's output
does not match its **Expected** section, stop there and use section 12 (rollback).

---

## Measurements behind this runbook (2026-09-14, read-only)

### Drives

```
Disk 0  NVMe SAMSUNG MZVL8512HELU-00BTW  476.9 GB  GPT     <- the ONLY physical disk
  partition 3  F:  223 GB   free 211.5 GB
  partition 4  C:  253 GB   free  48.5 GB
D:  does not exist
```

**C: and F: are the same physical disk.** A copy on F: survives a Windows reinstall or C:
filesystem damage. It does not survive a failed disk, a stolen laptop, or ransomware. F: is used
here as the *first* destination only.

### The second physical destination

The only other disk this laptop can reach is the SMB share on the **test computer**:
`\\192.168.170.8\dumps`. Measured: reachable (`Test-Path` True, TCP 445 open), 844.4 GB free of
930.9 GB. It already holds `prod-20260913.dump` and `afrakala-db-20260913-post-release-696.dump`.

This means **the backup depends on the test computer being on and reachable at 04:00.**

- If the test computer is off, asleep, rebooting, or has changed IP, the backup script takes and
  verifies the local dump, then **exits 20**. The data is then on one disk only, and the task
  result shows 20 (`0x14`). Before this change the same situation returned 0.
- **Access comes from an interactive `net use` session, not a stored credential.**
  `cmdkey /list` has no entry for `192.168.170.8`. The backup task runs whether or not anyone is
  logged on (`LogonType=Password`), so it may not have that session. Block 5 handles this.
- **Real company records will sit on the development machine.** The test computer's identity data
  was anonymised on 2026-08-14. Every nightly dump puts real customer, supplier and invoice rows
  back on it, readable by anyone who can read the share. The share already holds two production
  dumps, so this already happens. It is still the owner's decision.
- **Both machines are in the same office on the same LAN.** A fire, a theft, or ransomware
  spreading over SMB can reach both. This is a second disk, not an off-site copy. A third, offline
  copy (for example a USB disk swapped weekly) is not part of this runbook.

### Dump size and growth, and the retention rule that follows

Measured from `C:\AfraKalaServer\AfraKalaNightlyBackups` (90 dumps, 2026-06-16 to 2026-09-14):

| date | dump size |
|---|---|
| 2026-06-16 | 6.38 MB |
| 2026-07-16 | 12.35 MB |
| 2026-08-14 | 19.21 MB |
| 2026-09-07 | 32.14 MB |
| 2026-09-14 | **34.65 MB** |

Growth: +0.31 MB/day over 90 days, **+0.51 MB/day over the last 30**, +0.36 MB/day over the last 7.
At 0.5 MB/day a dump reaches about 220 MB in a year. The database itself is 479 MB (on-disk data
directory 596 MB). The storage volume holds **0 files** and `storage.objects` has **0 rows**, so
the database dump is the whole business state today.

Old footprint: 1,714 MB in the nightly folder (90 dumps plus 91 source zips of about 1.3 MB each) and
243 MB in the weekly folder, whose dumps have the same date and the same byte length as the Friday nightly dumps (a second copy, not a second backup; hashes not compared).

Two things the old files show:

- **2026-08-12 and 2026-08-13 have a source zip but no dump.** No dump was written on the cutover days
  and nothing reported it for a month.
- The old rule deleted files older than 90 days **before** taking the new dump. If dumps fail for
  90 days in a row, that rule deletes the last good one.

**Retention rule (the defaults in `AfraKala-AutoBackup.ps1`):**

> Keep the newest dump of each of the **30** most recent days, plus the newest dump of each of the
> **12** most recent weeks (weeks start Monday), plus the newest dump of each of the **13** most
> recent calendar months. Prune only after a dump has been verified. Only files named
> `afrakala-db-yyyyMMdd-HHmmss.dump` can be deleted; hand-named dumps are never touched.

Why these numbers:

- **30 daily.** The missing 08-12/08-13 dumps went unnoticed for a month. A data error found at
  month-end close needs a restore point for the exact day it happened.
- **12 weekly** gives about one quarter of weekly restore points.
- **13 monthly** covers a full fiscal year plus the month before it, for year-end reconciliation.
- **Space.** A steady state keeps 47 files (measured in the retention test: 400 daily inputs, 47
  kept). At today's size that is about 1.6 GB per destination. If every kept file were the
  projected one-year size (220 MB), it would be about 10 GB. F: has 211 GB free and the share 844 GB.
- **Counting, not age.** A 200-day outage followed by one new dump still keeps 35 files (tested).
  An age rule would keep 1.

Retention tests, run against the function extracted from the committed script:
`newest kept · older same-day not kept · hand-named and foreign dumps never candidates · 30th day
kept · 13 distinct months kept · keep <= 55 · every candidate classified once · 3 dumps -> 0
deleted · 200-day gap -> 35 kept · empty input` — **ALL PASS**.

### Scheduled tasks as found

| task | state | runs | trigger | last result |
|---|---|---|---|---|
| `AfraKala Auto Backup` | Ready | `...get-git-going01lan\AfraKala-AutoBackup.ps1` | daily 04:00 **and** Monday 01:30 | **1** (2026-09-14 04:00:01) |
| `AfraKala Auto Backup Nightly` | Ready | the **same** script; its argument string has an unterminated quote and no `-ExecutionPolicy Bypass` | daily 04:00 **and** Monday 02:00 | 0 (2026-09-14 04:00:01) |
| `AfraKala LAN Nightly Backup` | Ready | `backup-afrakala-lan.ps1` (writes to `D:`) | daily 02:30 | 1 |
| `AfraKala LAN Weekly Heavy Backup` | Ready | `backup-afrakala-heavy-weekly.ps1` (writes to `D:`) | Friday 03:30 | 1 |
| `AfraKala LAN Auto Start` | **Disabled** | `...get-git-going01lan\start-afrakala-lan.ps1` | at logon | 0 (2026-09-12) |

There are **five** tasks, not four. Both `AfraKala Auto Backup` tasks ran the same script in the
same second this morning: one returned 1 and the other 0.

### Containers are split across two compose trees

```
afrakala-lan-web, afrakala-lan-meta                    <- C:\afrakala\deploy\lan\docker-compose.yml
afrakala-lan-db, kong, auth, rest, storage, db-role-fix <- C:\AfraKalaServer\get-git-going01lan\deploy\lan\docker-compose.yml
```

Both share the compose project name `afrakala-lan`. The canonical compose file also defines
`caddy` (port 443, not running on this host) and two extra kong settings. A plain `up -d` from it
would start a proxy that is not running today and would recreate kong. That is why the new
autostart script names its services explicitly and passes `--no-recreate`.

### What a reboot through the OLD autostart would have stripped

Running `afrakala-lan-web`, key names only (values were never read):

```
set    OLLAMA_API_URL OLLAMA_MODEL OLLAMA_EMBED_MODEL OLLAMA_VISION_MODEL
set    WHATSAPP_PLATFORM_BASE_URL (compose default)   ISSABEL_CDR_PORT (compose default)   OCR_ENABLED
EMPTY  OLLAMA_API_KEY WHATSAPP_TOP_PRODUCTS_LIMIT MARKETING_TASKS_WORKER_TOKEN
EMPTY  ISSABEL_CDR_HOST ISSABEL_CDR_USER ISSABEL_CDR_PASSWORD ISSABEL_CDR_DB ISSABEL_IMPORT_WORKER_TOKEN
EMPTY  APP_SUPABASE_PUBLIC_URL
```

Recreating web from the stale tree removes all 15 keys. The ones that are **set** today (Ollama
and the WhatsApp base URL) would lose their values, so the features using them would stop working.
The ones that are empty today would lose nothing functional yet, but the key itself would be gone,
so filling in `.env.lan` later would silently reach nothing. Neither `.env.lan` file contains
`WHATSAPP_*`, `MARKETING_TASKS_WORKER_TOKEN`, `ISSABEL_*` or `APP_SUPABASE_PUBLIC_URL`.

---

## 0 · Preconditions: read-only, change nothing

**0.1** The owner has approved this runbook, including the owner decisions in blocks 5, 8 and 10.

**0.2** The scripts the tasks will run must come from reviewed code on `main`, because the tasks
run them directly from the checkout. If `C:\afrakala` is switched to another branch, the task
silently runs whatever that branch contains. When this runbook was written, the checkout was on
`feature/prod-env-gap`, **not** `main`.

```powershell
git -C C:\afrakala rev-parse --abbrev-ref HEAD
git -C C:\afrakala status --porcelain -- deploy/lan/scripts
Select-String -Path C:\afrakala\deploy\lan\scripts\AfraKala-AutoBackup.ps1, C:\afrakala\deploy\lan\scripts\start-afrakala-lan.ps1 -Pattern 'PlanOnly' -List | Select-Object Path
```

**Expected:**
```
main
                                   <- empty: no local edits under deploy/lan/scripts
Path
----
C:\afrakala\deploy\lan\scripts\AfraKala-AutoBackup.ps1
C:\afrakala\deploy\lan\scripts\start-afrakala-lan.ps1
```

If the first line is not `main`, or either path is missing, stop. The branch has not reached
production through `staging -> main` yet.

**0.3** The stack is healthy before you start:

```powershell
docker ps -a --filter name=afrakala-lan --format "table {{.Names}}\t{{.Status}}"
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:3000/api/healthz
```

**Expected:** `afrakala-lan-db-role-fix` is `Exited (0)`, the other seven `afrakala-lan-*` containers
are `Up`, and healthz prints `200`.

---

## 1 · Take a backup BEFORE anything is installed

This block uses only the commands already proven on this laptop (`pg_dump -Fc` inside the container,
then `docker cp` out). It does not use the new script, so a bug in the new script cannot affect
this backup. The file name starts with `pre-install-`, which the retention rule never matches, so
it is never pruned.

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$f = "pre-install-$stamp.dump"
New-Item -ItemType Directory -Force F:\AfraKalaBackups\pre-install | Out-Null
docker exec afrakala-lan-db pg_dump -U postgres -d postgres -Fc -f /tmp/$f
"pg_dump exit=$LASTEXITCODE"
docker exec afrakala-lan-db sh -c "pg_restore --list /tmp/$f | grep -c ' TABLE DATA public '"
docker exec afrakala-lan-db psql -U postgres -d postgres -Atc "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname = 'public'"
$inner = ((docker exec afrakala-lan-db sha256sum /tmp/$f) -split '\s+')[0]
docker cp "afrakala-lan-db:/tmp/$f" "F:\AfraKalaBackups\pre-install\$f"
"docker cp exit=$LASTEXITCODE"
$local = (Get-FileHash "F:\AfraKalaBackups\pre-install\$f" -Algorithm SHA256).Hash.ToLower()
Copy-Item "F:\AfraKalaBackups\pre-install\$f" "\\192.168.170.8\dumps\$f"
$remote = (Get-FileHash "\\192.168.170.8\dumps\$f" -Algorithm SHA256).Hash.ToLower()
"container=$inner"; "local    =$local"; "share    =$remote"
"ALL EQUAL=$(($inner -eq $local) -and ($local -eq $remote))"
docker exec afrakala-lan-db rm -f /tmp/$f
Get-Item "F:\AfraKalaBackups\pre-install\$f", "\\192.168.170.8\dumps\$f" | Select-Object FullName, Length
```

**Expected:**
```
pg_dump exit=0
227            <- TABLE DATA public entries in the dump (value on 2026-09-14)
227            <- live public tables; the first number must be >= this one
docker cp exit=0
container=<64 hex>
local    =<same 64 hex>
share    =<same 64 hex>
ALL EQUAL=True
FullName                                              Length
F:\AfraKalaBackups\pre-install\pre-install-....dump   ~36000000
\\192.168.170.8\dumps\pre-install-....dump            <same Length>
```

Write the file name and the hash in the run record. Do not continue unless `ALL EQUAL=True`.

---

## 2 · Export the current task definitions (rollback material)

```powershell
New-Item -ItemType Directory -Force F:\AfraKalaBackups\task-xml-20260914 | Out-Null
foreach ($t in 'AfraKala Auto Backup', 'AfraKala Auto Backup Nightly', 'AfraKala LAN Nightly Backup', 'AfraKala LAN Weekly Heavy Backup', 'AfraKala LAN Auto Start') {
    Export-ScheduledTask -TaskName $t | Out-File -Encoding Unicode ("F:\AfraKalaBackups\task-xml-20260914\" + ($t -replace ' ', '-') + '.xml')
}
Get-ChildItem F:\AfraKalaBackups\task-xml-20260914 | Select-Object Name, Length
```

**Expected:** five `.xml` files, none with Length 0.

---

## 3 · Dry-run both new scripts: read-only

`-PlanOnly` takes no dump, copies nothing, deletes nothing, runs no `compose up`, and writes no
status file. Both commands were run on 2026-09-14 and produced the output shown.

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\afrakala\deploy\lan\scripts\AfraKala-AutoBackup.ps1 -PlanOnly
"exit=$LASTEXITCODE"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\afrakala\deploy\lan\scripts\start-afrakala-lan.ps1 -PlanOnly
"exit=$LASTEXITCODE"
```

**Expected** (timestamps differ):
```
AfraKala DB backup start. PlanOnly=True
container afrakala-lan-db running
local free space on F: : 211.5 GB (minimum 5)
second destination parent reachable: True (\\192.168.170.8\dumps\afrakala-prod-db)
local root does not exist yet: F:\AfraKalaBackups\db
second root not present yet: \\192.168.170.8\dumps\afrakala-prod-db
PLAN OK: preflight passed; no dump taken, nothing copied or deleted
exit=0
AfraKala LAN autostart. PlanOnly=True
checkout lan dir: C:\afrakala\deploy\lan
docker engine ready: 29.4.1
compose config declares all 19 required web keys
command: docker compose --env-file C:\afrakala\deploy\lan\.env.lan -f C:\afrakala\deploy\lan\docker-compose.yml up -d --no-deps --no-recreate db kong auth rest storage meta web
PLAN: compose up skipped
afrakala-lan-web carries all 19 required keys (names checked, values not read)
/api/healthz 200
EXIT 0 - OK
exit=0
```

The negative case was also tested. The autostart script was run with `-PlanOnly` against a copy of
the **stale** tree's compose file. It refused before any `up`, with exit 20 and
`compose config does not give web these keys, so up was NOT run: OLLAMA_API_URL, ... APP_SUPABASE_PUBLIC_URL`
(all 15 keys listed).

---

## 4 · Repoint `AfraKala Auto Backup` to the new script

This task is kept because it runs whether or not anyone is logged on (`LogonType=Password`) and at
the highest privileges. The script path contains no spaces, so no inner quotes are needed. `/RP *`
prompts for the Windows password of `AfRa KaLa`; type it at the prompt, never on the command line.

```powershell
schtasks /Change /TN "AfraKala Auto Backup" /TR "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\afrakala\deploy\lan\scripts\AfraKala-AutoBackup.ps1" /RU "AfRa KaLa" /RP *
```

**Verify:**
```powershell
$t = Get-ScheduledTask -TaskName "AfraKala Auto Backup"
$t.State; $t.Actions | Format-List Execute, Arguments; $t.Principal | Format-List UserId, LogonType, RunLevel
```

**Expected:**
```
Ready
Execute   : powershell.exe
Arguments : -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\afrakala\deploy\lan\scripts\AfraKala-AutoBackup.ps1
UserId    : AfRa KaLa
LogonType : Password
RunLevel  : Highest
```

Known and accepted: the task keeps its second trigger (Monday 01:30), so on Mondays a second
verified dump is taken 2.5 hours before the 04:00 one. The daily retention rule keeps only the
newest dump of that day, so the cost is one extra copy. To remove that trigger, use the Task
Scheduler GUI. `schtasks /Change` cannot remove a single trigger.

---

## 5 · Give the backup task access to the share: owner decision

The task runs without an interactive session, and no credential is stored for `192.168.170.8`.
Store one for the task's own user. Use an account **on the test computer** that can write to
`dumps`. `cmdkey` prompts for the password.

```powershell
cmdkey /add:192.168.170.8 /user:<test-computer-account>
cmdkey /list | Select-String '192.168.170.8'
```

**Expected:** `Target: Domain:target=192.168.170.8`. This block alone cannot prove the task can use
the credential. Block 6 proves it.

---

## 6 · Delete the duplicate `AfraKala Auto Backup Nightly`

This is the duplicate: it ran the same script at the same minute as `AfraKala Auto Backup`, and its
argument string has an unterminated quote. Its definition was exported in block 2.

```powershell
schtasks /Delete /TN "AfraKala Auto Backup Nightly" /F
```

**Verify:**
```powershell
Get-ScheduledTask | Where-Object TaskName -like 'AfraKala*' | Select-Object TaskName, State
```

**Expected:** four rows. `AfraKala Auto Backup Nightly` is gone.

---

## 7 · First real backup, on demand

```powershell
schtasks /Run /TN "AfraKala Auto Backup"
```

Wait about two minutes. While the task is still running, `LastTaskResult` reads `267009`.

```powershell
Get-ScheduledTaskInfo -TaskName "AfraKala Auto Backup" | Select-Object LastRunTime, LastTaskResult
Get-Content F:\AfraKalaBackups\db\LAST-RUN-STATUS.txt -TotalCount 3
Get-ChildItem F:\AfraKalaBackups\db, \\192.168.170.8\dumps\afrakala-prod-db -Filter 'afrakala-db-*' | Select-Object FullName, Length
Get-ChildItem F:\AfraKalaBackups\db, \\192.168.170.8\dumps\afrakala-prod-db -Filter 'afrakala-db-*.dump' | Get-FileHash -Algorithm SHA256 | Select-Object Hash, Path
Select-String -Path F:\AfraKalaBackups\db\LAST-RUN-STATUS.txt -Pattern 'pg_restore --list OK', 'LOCAL OK', 'SECOND OK'
```

**Expected:**
```
LastTaskResult : 0
result      : OK afrakala-db-2026MMDD-HHMMSS.dump 3x.xx MB verified on both destinations
exit code   : 0
...\db\afrakala-db-....dump                          ~36000000
...\db\afrakala-db-....dump.sha256                   ~101
...\afrakala-prod-db\afrakala-db-....dump            <same Length>
...\afrakala-prod-db\afrakala-db-....dump.sha256     <same Length>
<hash A>  F:\...          <hash A>  \\192.168.170.8\...      <- identical
pg_restore --list OK: <n> TOC entries; public TABLE DATA 227; live public tables 227
LOCAL OK: ...
SECOND OK: ...
```

If the result is:
- **20**: the local dump is good but the share copy failed. Read the `EXIT 20` line in the status
  file. The usual cause is the credential from block 5. Fix it and repeat this block. **Do not
  treat 20 as a success.**
- **12**: the dump is unreadable, or holds data for fewer tables than the database has. Stop and
  keep the block 1 dump as the restore point.
- **10 / 11 / 13 / 99**: read the status file. Nothing was pruned, because pruning only runs after
  a verified local copy.

Then check the next scheduled run the following morning, the same way: `LastRunTime` about 04:00
and `LastTaskResult` 0.

---

## 8 · The two tasks that write to D: (owner decision: recommended Disable, not Delete)

`AfraKala LAN Nightly Backup` and `AfraKala LAN Weekly Heavy Backup` fail on every run: both stop with an error when
they try to create their folder on `D:`. The new script replaces their database dump.
What they would have added, if they worked:

- a storage-volume tarball. The volume is empty today.
- a copy of `.env.lan` and `kong.yml`. That is a backup of secrets, which is a decision in itself.
- `docker save` of seven images, which gives an image rollback point.
- a source snapshot, which git already holds.

Leaving them enabled means two red results every week that everyone learns to ignore. That is how
a real exit 20 from block 7 would get missed. Disabling them is reversible; deleting them is not.

```powershell
schtasks /Change /TN "AfraKala LAN Nightly Backup" /DISABLE
schtasks /Change /TN "AfraKala LAN Weekly Heavy Backup" /DISABLE
Get-ScheduledTask | Where-Object TaskName -like 'AfraKala*' | Select-Object TaskName, State
```

**Expected:**
```
AfraKala Auto Backup               Ready
AfraKala LAN Auto Start            Disabled
AfraKala LAN Nightly Backup        Disabled
AfraKala LAN Weekly Heavy Backup   Disabled
```

---

## 9 · Repoint and re-enable `AfraKala LAN Auto Start`

**9.1 Optional dry run of the exact `up`.** Compose `--dry-run` prints what `up` would do without
doing it. It was **not** run while this runbook was written, because the mission forbade anything
close to a restart. Run it only if you accept that.

```powershell
docker compose --dry-run --env-file C:\afrakala\deploy\lan\.env.lan -f C:\afrakala\deploy\lan\docker-compose.yml up -d --no-deps --no-recreate db kong auth rest storage meta web
```

**Expected:** every service reports `Running`, and no line says `Recreate`, `Create` or `Starting`
for a container that is already up. If any line says `Recreate`, stop. `--no-recreate` did not
behave as described, and this block must not continue.

**9.2 Repoint.** This task uses `LogonType=InteractiveToken`, so no password is needed.

```powershell
schtasks /Change /TN "AfraKala LAN Auto Start" /TR "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\afrakala\deploy\lan\scripts\start-afrakala-lan.ps1"
(Get-ScheduledTask -TaskName "AfraKala LAN Auto Start").Actions | Format-List Execute, Arguments
```

**Expected:**
```
Execute   : powershell.exe
Arguments : -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\afrakala\deploy\lan\scripts\start-afrakala-lan.ps1
```

**9.3 Enable.**

```powershell
schtasks /Change /TN "AfraKala LAN Auto Start" /ENABLE
(Get-ScheduledTask -TaskName "AfraKala LAN Auto Start").State
```

**Expected:** `Ready`

**9.4 Verify at the next logon or reboot.** The trigger is *at logon* of `AfRa KaLa`. The script
waits up to 300 s for Docker, then up to 180 s for healthz.

```powershell
Get-ScheduledTaskInfo -TaskName "AfraKala LAN Auto Start" | Select-Object LastRunTime, LastTaskResult
Get-Content C:\afrakala\deploy\lan\scripts\last-autostart-status.txt -TotalCount 3
Select-String -Path C:\afrakala\deploy\lan\scripts\last-autostart-status.txt -Pattern 'required web keys', 'required keys', 'healthz'
```

**Expected:**
```
LastTaskResult : 0
result       : OK
exit code    : 0
compose config declares all 19 required web keys
afrakala-lan-web carries all 19 required keys (names checked, values not read)
/api/healthz 200
```

A result of **30** means the running web container lacks keys, because it was created from another
compose tree. The script did not change it. Redeploy web with the documented command in
`CLAUDE.md` ("A deploy touches the `web` service only"). A result of **20** means the compose file
next to the script lacks the keys, and `up` was not run.

---

## 10 · Compose `environment:` additions: ONLY if the autostart stays on the stale tree

**Recommended: do not do this.** Block 9 points the task at `C:\afrakala`, whose compose file already
declares all 15 keys (lines 54-84, measured by the `-PlanOnly` run in block 3). No compose edit is
needed for that path.

If the owner still wants the stale tree `C:\AfraKalaServer\get-git-going01lan` to drive autostart,
its compose file needs these lines. **Written, not applied. No compose file was edited.**

**File:** `C:\AfraKalaServer\get-git-going01lan\deploy\lan\docker-compose.yml`
**Current lines 36-48** (quoted exactly):

```yaml
    image: afrakala-app:lan
    container_name: afrakala-lan-web
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      HOST: 0.0.0.0
      PORT: "3000"
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_PUBLISHABLE_KEY: ${SUPABASE_PUBLISHABLE_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      LOVABLE_API_KEY: ${LOVABLE_API_KEY}
      OCR_ENABLED: ${OCR_ENABLED:-false}
    ports:
      - "${APP_PORT:-3000}:3000"
```

**Insert after line 46** (`OCR_ENABLED: ${OCR_ENABLED:-false}`) and before line 47 (`ports:`).
These are the same names and defaults as the canonical file, lines 56-84, with the comments
translated to English:

```yaml
      # Self-hosted Ollama (names read by src/routes/api/messenger/ai-chat.ts).
      OLLAMA_API_URL: ${OLLAMA_API_URL:-}
      OLLAMA_API_KEY: ${OLLAMA_API_KEY:-}
      OLLAMA_MODEL: ${OLLAMA_MODEL:-}
      OLLAMA_EMBED_MODEL: ${OLLAMA_EMBED_MODEL:-}
      OLLAMA_VISION_MODEL: ${OLLAMA_VISION_MODEL:-}
      # Runtime public Kong URL for /api/version. Never http://kong:8000.
      APP_SUPABASE_PUBLIC_URL: ${APP_SUPABASE_PUBLIC_URL:-}
      WHATSAPP_PLATFORM_BASE_URL: ${WHATSAPP_PLATFORM_BASE_URL:-http://192.168.170.8:8002}
      # Rows for the WhatsApp top-products card. Empty = 1000. Runtime-only.
      WHATSAPP_TOP_PRODUCTS_LIMIT: ${WHATSAPP_TOP_PRODUCTS_LIMIT:-}
      # Bearer token for POST /api/public/hooks/generate-marketing-tasks. Empty = endpoint answers 500.
      MARKETING_TASKS_WORKER_TOKEN: ${MARKETING_TASKS_WORKER_TOKEN:-}
      # Read-only Issabel CDR connection (server-only, never VITE_).
      ISSABEL_CDR_HOST: ${ISSABEL_CDR_HOST:-}
      ISSABEL_CDR_PORT: ${ISSABEL_CDR_PORT:-3306}
      ISSABEL_CDR_USER: ${ISSABEL_CDR_USER:-}
      ISSABEL_CDR_PASSWORD: ${ISSABEL_CDR_PASSWORD:-}
      ISSABEL_CDR_DB: ${ISSABEL_CDR_DB:-}
      # Shared token for POST /api/public/hooks/import-issabel-calls. Empty = endpoint answers 500.
      ISSABEL_IMPORT_WORKER_TOKEN: ${ISSABEL_IMPORT_WORKER_TOKEN:-}
```

That is 15 keys, indented six spaces like the lines above them. The stale tree's `.env.lan` contains
only the five `OLLAMA_*` of these, so after the edit the other ten resolve to their defaults or to
empty. That matches what the running container has today. Editing the file changes nothing until a
container is created from it. Verify with the same negative test used in block 3: the autostart
script's `-PlanOnly`, run from a copy of the script under `...\get-git-going01lan\deploy\lan\scripts\`,
must print `compose config declares all 19 required web keys`.

---

## 11 · What this runbook does not do

- **No off-site or offline copy.** Both destinations are in the same office.
- **The storage volume is not backed up.** It is empty today (0 objects); revisit when uploads start.
- **Role globals are not dumped.** They are recreated by the init scripts and `db-role-fix`.
- **No restore drill.** `pg_restore --list` proves the archive is readable and complete at the table
  level. It does not prove a restore succeeds. A scratch-database restore of one nightly dump should
  be scheduled.
- **No alerting.** A non-zero task result is visible in Task Scheduler and in
  `F:\AfraKalaBackups\db\LAST-RUN-STATUS.txt`, but nobody is notified. Someone must look.
- **`ExecutionTimeLimit` on `AfraKala Auto Backup` is `PT0S` (unlimited).** A hung `docker cp` would
  block every later run (`MultipleInstancesPolicy=IgnoreNew`). Setting a one-hour limit needs the
  Task Scheduler GUI, or re-registering the task with the password.
- **Autostart fires only at logon.** After an unattended reboot with nobody logged on, neither Docker
  Desktop nor this task runs.
- **The legacy dump folders stay.** `C:\AfraKalaServer\AfraKalaNightlyBackups` (1.7 GB) and
  `...\AfraKalaWeeklyHeavyBackups` (243 MB) are no longer pruned by anything once block 4 is done.
  Deleting them is a separate, explicit owner decision.
- **A `git pull` in `C:\afrakala` changes the scripts the tasks run.** That is intended (reviewed code
  on `main`), but it means the backup behaviour is part of every production pull.

---

## 12 · Rollback

Each rollback undoes one block. Run only the ones whose blocks you ran.

**R4. Point `AfraKala Auto Backup` back at the old script.** The old path has no spaces; `/RP *`
prompts for the password.
```powershell
schtasks /Change /TN "AfraKala Auto Backup" /TR "powershell.exe -ExecutionPolicy Bypass -File C:\AfraKalaServer\get-git-going01lan\AfraKala-AutoBackup.ps1" /RU "AfRa KaLa" /RP *
(Get-ScheduledTask -TaskName "AfraKala Auto Backup").Actions | Format-List Arguments
```
Expected: `Arguments : -ExecutionPolicy Bypass -File C:\AfraKalaServer\get-git-going01lan\AfraKala-AutoBackup.ps1`.
The old script is unchanged in that folder (SHA256 `CAC5E45168E9...` on 2026-09-14).

**R5. Remove the stored share credential.**
```powershell
cmdkey /delete:192.168.170.8
```

**R6. Recreate the deleted duplicate** from its export. It is a Password-logon task, so `/RP *` prompts:
```powershell
schtasks /Create /TN "AfraKala Auto Backup Nightly" /XML F:\AfraKalaBackups\task-xml-20260914\AfraKala-Auto-Backup-Nightly.xml /RU "AfRa KaLa" /RP *
Get-ScheduledTask -TaskName "AfraKala Auto Backup Nightly" | Select-Object TaskName, State
```
Expected: `AfraKala Auto Backup Nightly  Ready`.

**R7. Files written by the first run.** New dumps are additive. Nothing that existed before was
deleted: retention only matches `afrakala-db-yyyyMMdd-HHmmss.dump`, and no such file existed on
either destination before block 7. Leave them in place.

**R8. Re-enable the two D: tasks.**
```powershell
schtasks /Change /TN "AfraKala LAN Nightly Backup" /ENABLE
schtasks /Change /TN "AfraKala LAN Weekly Heavy Backup" /ENABLE
```

**R9. Return autostart to its found state** (old script, **Disabled**):
```powershell
schtasks /Change /TN "AfraKala LAN Auto Start" /DISABLE
schtasks /Change /TN "AfraKala LAN Auto Start" /TR "powershell.exe -ExecutionPolicy Bypass -File C:\AfraKalaServer\get-git-going01lan\start-afrakala-lan.ps1"
Get-ScheduledTask -TaskName "AfraKala LAN Auto Start" | Select-Object State, @{n='Args';e={$_.Actions.Arguments}}
```
Expected: `Disabled` and the old path. **Leave it Disabled.** Re-enabling the old script
reintroduces the env-stripping reboot this runbook exists to remove.

**R10.** Restore the stale compose file from the copy you took before editing it. There is no
edit to undo if block 10 was skipped.

**Scripts.** The previous versions of both files are in git at `9bc8d554`:
```powershell
git -C C:\afrakala show 9bc8d554:deploy/lan/scripts/AfraKala-AutoBackup.ps1 | Select-Object -First 3
```
Do not `git checkout` an old version into `C:\afrakala`. Rollback is done by repointing the tasks
(R4, R9), not by editing the production checkout.
