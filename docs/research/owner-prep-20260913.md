# Owner prep pack · 2026-09-13

> Gathered on the **production host** `192.168.170.10` on 2026-09-12, late afternoon, **with staff
> working**. Every query was read-only: `SELECT`, registry reads, `docker inspect`, `Get-ScheduledTask`.
> **Nothing was written, no container was restarted, nothing was deployed.**
>
> One finding cuts across all three sections and is stated first, because it changes what sections 1
> and 3 mean.

---

## 0 · The finding that reframes the rest

**The running container stack was not created by tonight's deploy. It was recreated at 16:43 local
by the `AfraKala LAN Auto Start` scheduled task, from a different and older checkout.**

```
afrakala-lan-web   created 2026-09-12T13:13:35Z  = 16:43:35 local
AfraKala LAN Auto Start   LastRun 09/12/2026 16:42:29   result=0

compose labels on every running container:
  project     : afrakala-lan
  working_dir : C:\AfraKalaServer\get-git-going01lan\deploy\lan
  config_file : C:\AfraKalaServer\get-git-going01lan\deploy\lan\docker-compose.yml
```

Tonight's deploy ran from `C:\afrakala`. **Two checkouts drive the same compose project**
(`afrakala-lan`), and the autostart task uses the one nobody updated. Its `docker-compose.yml` is
materially older — the diff is 65 lines, and what it *lacks* is the point:

| absent from the autostart tree's compose | consequence, measured inside the live container |
|---|---|
| `ISSABEL_CDR_HOST/PORT/USER/PASSWORD/DB`, `ISSABEL_IMPORT_WORKER_TOKEN` | `env \| grep -c ISSABEL` = **0** → the CDR import path returns `config_missing` |
| `OLLAMA_API_URL/KEY/MODEL/EMBED_MODEL/VISION_MODEL` | `OLLAMA*` = **0** → no Ollama endpoint at all |
| `WHATSAPP_PLATFORM_BASE_URL`, `WHATSAPP_TOP_PRODUCTS_LIMIT` | `WHATSAPP*` = **0** |
| `MARKETING_TASKS_WORKER_TOKEN` | `MARKETING*` = **0** |
| `GIT_SHA`, `BUILD_TIME`, `APP_ENV`, `VITE_APP_ENV`, `VITE_TRUSTED_HOSTS` build args | a rebuild from that tree would stamp `APP_GIT_SHA=local-unknown` |
| `KONG_NGINX_HTTP_*` header buffers | large-header requests unprotected |
| the whole `caddy` service (HTTPS on 443) | **not running**; nothing listens on 443 |

`.env.lan` differs too, though only mildly: `VITE_APP_ENV` and `VITE_TRUSTED_HOSTS` exist only in
`C:\afrakala`, and `OCR_ENABLED` and `SMTP_SENDER_NAME` hold different values. Neither file pins
`GIT_SHA`.

**Three previously-open puzzles are explained by this one fact:**

1. **`call_logs` is empty** — not because nobody ran the importer, but because the importer cannot
   work in the container that is running. Section 1 depends on this.
2. **`/api/healthz` reports `whatsapp: {state: down, detail: TypeError}`** — flagged after the
   deploy as "either the bridge is unreachable or the check has a defect". Neither:
   `WHATSAPP_PLATFORM_BASE_URL` is simply absent, so the check fetches an undefined URL and throws.
   Environmental, not a code defect.
3. **Receipt OCR** has a second, independent reason to fail on top of the provider not declaring
   `vision`: the container has no Ollama URL.

**An important subtlety about the deploy-integrity check.** `APP_GIT_SHA` still reads `d60232f5`
and still equals `main`'s HEAD, and the served build still carries the new-code marker
(`currencies?select=id` present, `shop_settings?select=key` absent), and `/login` and
`/api/healthz` both return 200. That is because `APP_GIT_SHA` is baked into the **image** by the
Dockerfile, not injected by compose. So it survived the recreate — which means:

> **`APP_GIT_SHA` matching proves the right code is running. It does NOT prove the container's
> runtime configuration is right.** Tonight it was right at Block 71 and wrong 4.5 hours later,
> with the check still green throughout.

---

## 1 · Extension mapping candidates — **cannot be produced from production yet**

Every call-related relation on production is empty:

```
call_logs                        0 rows      (56 kB, 15 columns)
call_log_extensions              0 rows
staff_daily_performance_metrics  0 rows
v_call_extension_daily           view over call_logs -> empty
v_call_extension_hourly          view over call_logs -> empty
```

So there is no `extension`, no inbound/outbound split, no first/last timestamp, no busiest hour and
no top-5 counterparties to report. **The table you wanted to fill employee names into cannot be
seeded from this database.** Producing an empty table and calling it delivered would have been
worse than saying so.

**Why it is empty** is section 0: the CDR importer's five `ISSABEL_CDR_*` variables plus
`ISSABEL_IMPORT_WORKER_TOKEN` never reach the container, so
`POST /api/public/hooks/import-issabel-calls` returns `config_missing`. The migrations that build
the importer (497, 498, 512, 513, 517, 520) all landed tonight and the schema is ready — the
plumbing to the PBX is not.

The extensions you named are therefore **not** derivable here. `201`, `406`, `449`, `450` have no
`call_log_extensions` row because that table has **no rows at all**; and `6001/6002/6003` cannot be
marked as queues from data that does not exist. Those numbers must have come from the test host or
from Issabel directly.

### What the table will look like once data exists

`call_logs` columns: `id, employee_id, direction, duration_seconds, started_at, ended_at,
customer_id, external_id, source, metadata, created_at, extension, is_missed, is_internal,
disposition`.

`call_log_extensions` columns: `extension, employee_id, label, created_at, updated_at, updated_by` —
this is the mapping table you fill in, one row per extension.

### The query is ready; it just needs rows

```sql
WITH per_ext AS (
  SELECT extension,
         count(*)                                                        AS total_calls,
         count(*) FILTER (WHERE direction = 'inbound')                   AS inbound,
         count(*) FILTER (WHERE direction = 'outbound')                  AS outbound,
         count(*) FILTER (WHERE is_internal)                             AS internal,
         count(*) FILTER (WHERE is_missed)                               AS missed,
         min(started_at)                                                 AS first_call,
         max(started_at)                                                 AS last_call,
         mode() WITHIN GROUP (ORDER BY extract(hour FROM started_at))    AS busiest_hour
    FROM public.call_logs
   WHERE extension IS NOT NULL
   GROUP BY extension
)
SELECT e.extension,
       CASE WHEN e.extension IN ('6001','6002','6003') THEN 'QUEUE' ELSE '' END AS kind,
       (x.employee_id IS NOT NULL)                                              AS already_mapped,
       e.total_calls, e.inbound, e.outbound, e.internal, e.missed,
       e.first_call, e.last_call, e.busiest_hour
  FROM per_ext e
  LEFT JOIN public.call_log_extensions x ON x.extension = e.extension
 ORDER BY e.total_calls DESC;
```

The top-5 counterparties per extension needs a column holding the other party's number.
`call_logs` has no such column — the candidates are `metadata` (jsonb) or `external_id`. **Which
key the importer writes the far-end number into is not yet established**, because no imported row
exists to look at. That part of the report has to wait for the first successful import.

### To unblock section 1

1. Recreate the stack from `C:\afrakala\deploy\lan\docker-compose.yml` so the `ISSABEL_*`
   variables reach the container (see section 3 — this is the same fix).
2. Confirm inside the container: `env | grep -c ISSABEL` should be **6**, not 0.
3. Run one import, then re-run the query above.

---

## 2 · Role inventory

**37 users · 23 admins · 8 stale admins (30+ days or never) · 8 with no role · 13 never signed in.**

Sorted by last sign-in, oldest first.

| email | roles | status | created | last sign-in | idle | flag |
|---|---|---|---|---|---|---|
| 12@gmail.com | (none) | rejected | 2026-05-30 | NEVER | — | |
| 1@gmail.com | (none) | rejected | 2026-05-30 | NEVER | — | |
| afrakaladidar400@gmail.**con** | admin | inactive | 2026-06-03 | NEVER | — | **STALE ADMIN** |
| afrakaladidar410@gmail.com | admin | inactive | 2026-05-17 | NEVER | — | **STALE ADMIN** |
| afrakalatest@gmail.com | (none) | rejected | 2026-05-30 | NEVER | — | |
| alihajrasouli@gmail.com | (none) | rejected | 2026-05-30 | NEVER | — | |
| chista@gmail.com | (none) | rejected | 2026-05-30 | NEVER | — | |
| mohammadrezaafra**666**@gmail.com | admin | rejected | 2026-05-30 | NEVER | — | **STALE ADMIN** |
| mohammadtest@afrakala.local | (none) | pending | 2026-09-12 | NEVER | — | banned, from Block 72a |
| rubika@gmail.com | sales,viewer | active | 2026-08-22 | NEVER | — | the only `viewer` |
| trbimelika82@gmail.com | admin | rejected | 2026-06-06 | NEVER | — | **STALE ADMIN** |
| vgholami872@gmail.com | sales | active | 2026-05-30 | NEVER | — | |
| vgholami@gmail.com | sales | active | 2026-05-30 | NEVER | — | |
| trbimelika82+old-restore@gmail.com | (none) | inactive | 2026-05-18 | 2026-05-18 06:30 | 117 d | restore artefact |
| chistasaadat@gmail.com | (none) | inactive | 2026-05-17 | 2026-05-18 09:09 | 117 d | |
| pourchista.saadat.mobaraki@gmail.com | sales | active | 2026-05-17 | 2026-05-19 13:12 | 116 d | |
| afrakaladdar94@gma**l**.com | admin,sales | active | 2026-05-18 | 2026-05-30 06:41 | 105 d | **STALE ADMIN** |
| mohammadrezaafra66+old-restore@gmail.com | admin | active | 2026-05-17 | 2026-06-03 11:24 | 101 d | **STALE ADMIN** · restore artefact |
| afra-admin@local.test | admin | inactive | 2026-06-06 | 2026-06-06 07:10 | 98 d | **STALE ADMIN** · test account |
| afrakaladidar414@gmail.com | admin,sales | active | 2026-05-18 | 2026-07-19 08:44 | 55 d | **STALE ADMIN** |
| pourchista.saadat.mobaraki@gmail.**con** | admin | active | 2026-05-18 | 2026-08-22 11:12 | 21 d | |
| mahdifeshki08@gmail.com | admin | active | 2026-05-18 | 2026-08-24 11:24 | 19 d | |
| arminragjan1@gmail.com | sales | active | 2026-05-18 | 2026-08-29 09:48 | 14 d | |
| afrakaladidar400@gmail.com | admin,sales | active | 2026-05-18 | 2026-09-12 07:01 | today | |
| afrakaladidar94@gmail.com | admin,sales | active | 2026-06-08 | 2026-09-12 07:19 | today | |
| mahdiheidaribm8@gmail.com | admin | active | 2026-05-19 | 2026-09-12 07:23 | today | |
| alihajrasoulii@gmail.com | admin,sales | active | 2026-05-30 | 2026-09-12 08:26 | today | |
| taheri83hediye@gmail.com | admin,manager | active | 2026-05-18 | 2026-09-12 12:20 | today | |
| afrakaladidar404@gmail.com | admin | active | 2026-05-18 | 2026-09-12 12:21 | today | |
| afrakaladidar110@gmail.com | admin,sales | active | 2026-05-18 | 2026-09-12 12:26 | today | |
| afrakaladidar413@gmail.com | admin,sales | active | 2026-05-18 | 2026-09-12 12:32 | today | |
| afrakaladidar400@gmail.**comm** | admin | active | 2026-06-03 | 2026-09-12 12:32 | today | |
| afrakaladidar402@gmail.com | accountant,admin,sales | active | 2026-05-18 | 2026-09-12 13:06 | today | |
| afrakaladidar1@gmail.com | admin,sales | active | 2026-05-18 | 2026-09-12 13:09 | today | |
| mohammadrezaafra66@gmail.com | admin | active | 2026-06-06 | 2026-09-12 13:16 | today | |
| alitalebizadeh1@gmail.com | admin,manager | active | 2026-05-19 | 2026-09-12 14:41 | today | |
| vgholami@gmail**78**.com | sales | active | 2026-05-30 | 2026-09-12 14:47 | today | |

Role distribution: `admin` 23 · `sales` 15 · `manager` 2 · `accountant` 1 · `viewer` 1.

### Three things worth acting on

**1 · Typo accounts, and some of them are live admins.** Three variants of one address exist —
`afrakaladidar400@gmail.com`, `...@gmail.con`, `...@gmail.comm` — and **two of the three hold
`admin`**, one of which signed in **today**. Same pattern for
`pourchista.saadat.mobaraki@gmail.com` vs `...@gmail.con` (the typo holds `admin` and signed in 21
days ago), `afrakaladdar94@gmal.com` vs `afrakaladidar94@gmail.com`,
`mohammadrezaafra66@gmail.com` vs `...afra666@...`, and `vgholami@gmail.com` vs
`vgholami@gmail78.com`. These are almost certainly duplicate registrations from mistyped addresses.
An account whose address does not exist **cannot receive a password reset**, so it can never be
recovered — and it cannot be notified about anything either.

**2 · 23 admins out of 37 users.** This is decision D-59, still standing. The deploy installed 15
client-side `admin` gates; with 23 admins, each one is open to roughly two thirds of the accounts.
**8 of those admins are stale** (never signed in, or not for 30+ days), including two test/restore
artefacts — `afra-admin@local.test` and `mohammadrezaafra66+old-restore@gmail.com`. Stale admins are
the cheapest thing on this list to remove.

**3 · 8 accounts hold no role and 5 of them are `rejected`.** Harmless but noise; they inflate the
user count and the `is_first` check in `handle_new_auth_user` counts `profiles`, so they are load-
bearing in one place nobody expects.

> **For the Block 72 cold-gate test**: the only clean non-admin accounts are the `sales`-only ones —
> `arminragjan1@gmail.com`, `vgholami@gmail.com`, `vgholami872@gmail.com`,
> `pourchista.saadat.mobaraki@gmail.com`, `vgholami@gmail78.com`. `rubika@gmail.com` is the only
> `viewer` but also holds `sales`, so a refusal there would not isolate which role caused it.

---

## 3 · Docker survivability after a reboot

### What is configured, measured

```
com.docker.service           StartType = Manual (DEMAND_START), currently Stopped
HKCU\...\Run  "Docker Desktop" = C:\Program Files\Docker\Docker\Docker Desktop.exe
HKLM\...\Run                   no Docker entry
AutoAdminLogon                 = 1
DefaultUserName                = AfRa KaLa
DefaultDomainName              = DESKTOP-MT8J1VR
DefaultPassword                = (not set)
AutoLogonCount / ForceAutoLogon= (not set)

Docker engine: Docker Desktop 4.71.0, server 29.4.1, linux/x86_64, overlayfs

container restart policies:
  afrakala-lan-web / kong / auth / db / storage / rest / meta   unless-stopped
  afrakala-lan-db-role-fix                                      no      (correct for a one-shot)
```

Scheduled tasks:

| task | run as | logon type | trigger | last result |
|---|---|---|---|---|
| **AfraKala LAN Auto Start** | AfRa KaLa | **Interactive** | **at logon** | 0 (ok) |
| AfraKala Auto Backup | AfRa KaLa | Password | daily + weekly 04:00 | 0 (ok) |
| AfraKala Auto Backup Nightly | AfRa KaLa | Password | daily + weekly 04:00 | 0 (ok) |
| AfraKala LAN Nightly Backup | AfRa KaLa | Interactive | daily 02:30 | **1 — FAILING** |
| AfraKala LAN Weekly Heavy Backup | AfRa KaLa | Interactive | weekly 03:30 | **1 — FAILING** |

`AfraKala LAN Auto Start` runs:

```powershell
Start-Sleep -Seconds 45
cd "C:\AfraKalaServer\get-git-going01lan\deploy\lan"
docker compose --env-file .env.lan up -d
docker ps -a --format "..." | Out-File "...\last-autostart-status.txt" -Encoding UTF8
```

### So: would the containers come back after a reboot with nobody at the keyboard?

**Probably yes, by two independent paths — but neither is verified, and one of them is actively
harmful.**

```
boot
 └─ AutoAdminLogon=1 as "AfRa KaLa"        <- UNVERIFIED (no DefaultPassword; if it works at all,
 │                                            the password is in an LSA secret, set by Sysinternals
 │                                            Autologon or similar. Only a real reboot proves it)
 └─ interactive session created
     ├─ HKCU\Run starts Docker Desktop
     │   └─ engine up -> `unless-stopped` containers restart on their own   <- this is the good path
     └─ "AfraKala LAN Auto Start" fires (logon trigger, 45 s delay)
         └─ `docker compose up -d` from the STALE tree                      <- this is the harmful one
```

**The `unless-stopped` policies are the real safety net** and they do not need the scheduled task at
all. The task is redundant for availability and is the thing that stripped the container's runtime
configuration this afternoon.

**Three specific weaknesses:**

1. **Everything hinges on an unverified autologon.** `AutoAdminLogon=1` with no `DefaultPassword` is
   the normal shape when Sysinternals `Autologon.exe` stored the credential in LSA — but it is also
   the shape of a half-finished configuration. `com.docker.service` is `Manual`, so there is **no
   session-independent path** to the engine. If autologon does not fire, nothing starts and the app
   is down until someone logs in.
2. **The autostart task reverts the deploy's configuration.** Demonstrated today: it recreated every
   container from a compose file that predates the `ISSABEL_*`, `OLLAMA_*`, `WHATSAPP_*` and
   `MARKETING_*` variables, the Kong header buffers, and the `caddy` HTTPS service. It also has no
   `--no-deps`, so it pulls `db-role-fix` into the graph — the container the runbook documents as
   unstartable on these machines (OG-68). It returned 0 today, so on this host it survives that;
   that is luck, not design.
3. **Two of the five backup tasks have been failing.** `AfraKala LAN Nightly Backup` returned **1**
   at 02:30 today and `AfraKala LAN Weekly Heavy Backup` returned **1** on 09-11. Both scripts exist
   on disk (dated 2026-05-27), so it is not a missing file. Nobody was notified — the same silent-
   failure pattern as `daily-birthday-notifications`. Meanwhile `AfraKala Auto Backup` and
   `AfraKala Auto Backup Nightly` both run the **same script at the same minute** (04:00:01 and
   04:00:02), so that backup runs twice nightly; and the second one's action string has an
   **unterminated quote** (`-File "C:\...\AfraKala-AutoBackup.ps1` with no closing quote) yet still
   reports success.

### Options, with their trade-offs — nothing changed

| # | option | effect | trade-off |
|---|---|---|---|
| **A** | **Point `AfraKala LAN Auto Start` at `C:\afrakala\deploy\lan` and add `--no-deps web`** — or delete the task outright | Removes the configuration-revert. The `unless-stopped` policies already restore the stack, so deleting it loses nothing for availability | Editing a scheduled task; if deleted, you lose the `last-autostart-status.txt` breadcrumb. **Lowest risk, highest value** |
| **B** | **Set `com.docker.service` to Automatic** | A session-independent route to the engine; removes the dependency on autologon | On Docker Desktop the service is a privileged helper, **not** the engine — the WSL2 engine still comes up with the user app. Likely necessary-but-insufficient on its own; needs a reboot test to know |
| **C** | **Prove the autologon** with one deliberate reboot, out of hours, watching whether the stack returns unattended | Converts the biggest unknown into a fact. This is the only option that actually answers the question | One planned outage; and if autologon does **not** work, the app is down until someone logs in physically |
| **D** | **Replace the logon task with a Windows service** (NSSM or `sc create`) running `docker compose up -d --no-deps` from `C:\afrakala` | Survives with no interactive session at all, independent of autologon | New moving part to maintain; must not race Docker Desktop's own startup — needs a readiness wait, not a fixed `Start-Sleep 45` |
| **E** | **Do nothing** | No work | Availability rests on an unverified autologon, and every reboot silently reverts the container configuration again |

**Recommended order: A, then C, then decide between B and D with the reboot's evidence in hand.**
A is a few minutes and removes a mechanism that has already caused harm; C is the only thing that
turns the central assumption into knowledge. B and D are both attempts to solve a problem whose
shape C would reveal.

Separately and independently: **fix the two failing backup tasks**, and collapse the duplicated
04:00 pair. A backup nobody has restored is only a hope — and two of these are not even running.

---

## Where this leaves the three sections

| section | status |
|---|---|
| 1 · extension mapping | **Blocked.** No call data exists, because the container lacks the `ISSABEL_*` variables. Unblocked by option A |
| 2 · role inventory | **Delivered.** 37 users, 23 admins, 8 stale, 5 typo-duplicates, 8 role-less |
| 3 · survivability | **Delivered.** Two restart paths, one unverified assumption, one actively harmful task, two failing backups |
