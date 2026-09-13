# Production release run · 2026-09-13 · RELEASE-20260913b

**Target:** `192.168.170.10` · DB `postgres` · container `afrakala-lan-db` · repo `C:\afrakala`
**Runbook:** `RELEASE-20260913b.md` (re-emitted; the first emit stopped at Block 1)
**Image:** `afrakala-app:lan` = `296eb4b4899f`, built from `main @ 3bc526c4`
**Executor:** Claude Code at the production keyboard, owner approving at each gate

**Outcome: PASSED.** No database rollback. No image rollback. Staff returned.

---

## Close-out

| | before | after |
|---|---|---|
| ledger rows | **681** | **696** |
| ledger max | `20260912150000` | `20260913111000` |
| `anon` readable relations | 20 | **20** |
| `anon` executable functions | 547 | **505** |
| `anon` default ACL entries | 0 | **0** |
| `APP_GIT_SHA` | `d60232f5` | **`3bc526c4`** = manifest = `git HEAD` |
| image | `8b04c479e022` | **`296eb4b4899f`** |
| rollback tag | `dc926c1a7224` (2 versions stale) | **`8b04c479e022`** (the image we replaced) |

`/login` 200 in 0.074 s, `text/html; charset=utf-8`, no `Server:` header.
`/api/healthz` 200, `{"ok":true,"status":"healthy"}` — database up, **whatsapp now up too**
(this deploy used `C:\afrakala`'s compose, which passes `WHATSAPP_PLATFORM_BASE_URL`).

### Blocks

**Run and matched Expect literally (18):** 1 · 5 · 6 · 7 · 8 · 9 · 10 · 11 · 12 · 13 · 14 · 15 ·
16 · 17 · 18 · 19 · 22 · 28 · 29 (prune only) · 30 · 31

**Deliberately skipped, by decision:**

| block | version | why |
|---|---|---|
| 2 (commit half) | — | moved to step 8 by owner decision; the copy half ran |
| **3, 4** | autostart tree | **STOPPED-DEFERRED** — see below |
| **20** | 20260818150000 (336) | HUMAN REVIEW; no ledger row. Superseded in effect by **527**, applied today |
| **21** | 20260818157000 (343) | HUMAN REVIEW; no ledger row. Superseded in effect by **528**, applied today |
| 23 | 20260905171000 (449) | OG-J — confirmed 0 rows |
| 24 | 20260905171500 (450) | OG-J — confirmed 0 rows |
| 25 | 20260905180000 (452) | OG-J — confirmed 0 rows |
| 26 | 20260913101000 (533) | OG-L — confirmed 0 rows |
| 27 | 20260913102000 (534) | OG-L — confirmed 0 rows |

**Nothing was excluded in step 1.** All six operational scripts passed the secret scan
(`PGPASSWORD=`, `password=`, `token=`, `key=`, JWT prefixes, long literals, and the live database
password). The only long literals are two `$TempContainer` container names.

---

## OG-A — 411 / 412 / 413 — CLOSED as "expected no-op"

The gate existed to catch **unapproved movement of real customers' credit**. Zero movement is the
safe direction, so the gate closed with the verdict *no-op — limits did not move*.

### What was measured on production

```
before : 1224 rows in customer_capital_allocations_dynamic, sum(final_limit) = 33,836,629,484
after  : 1224 rows,                                          sum(final_limit) = 33,836,629,484
per customer (122 distinct): changed = 0   unchanged = 122   sum_of_deltas = +0
```

The three named customers, before → after:

```
کوثری کوروش     532,656,416  →  532,656,416
کوروش کوثری     115,605,550  →  115,605,550
تست 2           208,995,462  →  208,995,462
اصحابی        1,577,910,520  → 1,577,910,520
```

*(A first comparison appeared to show movement. It was a cartesian join on a non-unique display
name; aggregating per customer gives zero. The false result is recorded because it is the kind of
artefact that could be mistaken for a finding.)*

### The migrations themselves did land

All three met their own `Expect:` lines literally, and their effect is visible:

```
customer_cooperation_months       1 .. 360             (was 1..240)
customer_purchase_1y              0 .. 25,000,000,000  (was 0..5,000,000,000)
salesperson_sales_amount_monthly  0 .. 15,000,000,000  (was 0..1,000,000,000)
input_hint                        «بین ۱ تا ۳۶۰ ماه»
```
`411` reported `7 ranges set; all customer score rows recomputed on the new scale` (7 `UPDATE 1` +
`UPDATE 337`); `413` reported `4 ranges set` (`UPDATE 48`).

### R-1's object and method — verbatim

R-1 measured **the same object** this run measured: `customer_capital_allocations_dynamic.final_limit`.
Its non-zero table exists only behind a synthetic precondition. From
`docs/research/convergence/R-1-schema-convergence.md`:

> `customer_capital_allocations_dynamic.final_limit` is written by
> `refresh_today_dynamic_capital_after_score_change()`, which **silently no-ops**
> (`RETURN COALESCE(NEW, OLD)`) unless a `daily_capital_settings` row exists for `CURRENT_DATE`.
> Production's most recent such row is **2026-09-06 — six days stale**. A first rehearsal applying
> 411/412/413 exactly as written moved **zero of 122 customers** — not because the migrations are
> inert, but because the recompute trigger had nothing to recompute into.
> **Applying 411/412/413 alone, today, would change zero live ceilings** until the next daily-capital
> snapshot runs.
>
> To produce the artifact the decision actually needs, the rehearsal inserted one synthetic
> `daily_capital_settings` row for `CURRENT_DATE` **inside the same rolled-back transaction**
> (cloning `total_capital = 2,000,000,000`, `scoring_mode='auto'` from the last real row) and called
> `recompute_dynamic_capital_setting()` before and after.

R-1's recorded absolutes, on **`prod_rehearsal_r1`** (a restore, not live production), inside a
rolled-back transaction:

| customer | before | after | delta |
|---|---:|---:|---:|
| اصحابی | 224,251,151 | 171,473,263 | −52,777,888 |
| خان محمدی | 455,093,003 | 455,093,003 | 0 |
| تست ۲ *(dummy)* | 104,497,731 | 115,412,437 | +10,914,706 |
| کوثری کوروش | 266,328,208 | 311,374,592 | +45,046,384 |
| remaining 118 of 122 | 0 | 0 | 0 |

**So the production result is exactly what R-1 predicted.** The zero is the forecast, not a
surprise.

### The mirrored name

R-1 means **`کوثری کوروش`**. Two distinct persons exist with mirrored names:

```
کوثری کوروش   fb5f1a72-fe8f-40b7-ab2b-66161b720c30      <- R-1's subject
کوروش کوثری   dbcba6e4-1c8b-440c-b399-d09a7f9438c0
```

### 🔴 OPEN ITEM

**Ceilings will only move on the next daily-capital snapshot; that snapshot path has not run for
7 days — unwired, not broken.** Measured on production today:

```
daily_capital_settings : last capital_date = 2026-09-06 · days_stale = 7 · rows_for_today = 0 · 16 rows total
```

`refresh_today_dynamic_capital_after_score_change()` returns `COALESCE(NEW, OLD)` and writes nothing
while no row exists for `CURRENT_DATE`. **No `daily_capital_settings` row was inserted on
production**, by instruction. Until that path runs, 411/413's recomputed scores have nowhere to land.

Short form for the tracker: *"scores recomputed by 411/413 but credit limits did not follow —
recompute path not wired or measured object wrong."*

---

## Blocks 3 and 4 — STOPPED-DEFERRED

Both were stopped before any change took effect. `Set-ScheduledTask` returned
`Access is denied (HRESULT 0x80070005)` and the task was left **exactly as it was**. The owner's
verdict was to defer rather than retry elevated, because of finding #1 below. The three findings,
verbatim:

1. **Repointing the task would go green without being correct.** The script the task would point at
   hardcodes the old tree in three places:
   ```powershell
   cd "C:\AfraKalaServer\get-git-going01lan\deploy\lan"
   docker compose --env-file .env.lan up -d
   ... Out-File "C:\AfraKalaServer\get-git-going01lan\last-autostart-status.txt"
   ```
   So the task would execute `C:\afrakala`'s copy, which `cd`s straight back into the old tree and
   composes from *its* compose file and `.env.lan`. Block 3's `Expect:` checks only the task's
   `Execute`/`WorkingDirectory`, so it would pass while behaviour is unchanged — the same
   "check that passes without being true" defect Block 29 documents about a different check.
   Block 4 adds `--no-deps` and does not touch the `cd`.
2. **Block 3's `Expect:` is imprecise.** `Actions[0].Execute` is always `powershell.exe`; the script
   path lives in `Arguments`. Even on success that line could not match literally.
3. **The existing task has no `-NoProfile` and an empty `WorkingDirectory`** — further differences
   from what the block asserts.

These become a dedicated ops runbook, owner-typed in an elevated shell: patch the script's
`cd`/compose/`Out-File` paths to `C:\afrakala`, add `--no-deps`, add `-NoProfile`, set
`WorkingDirectory`, and assert on `Arguments` rather than `Execute`.

---

## Block 5 — OCR and Ollama, on both trees

Appended identically to **both** `.env.lan` files (`C:\afrakala` and
`C:\AfraKalaServer\get-git-going01lan`), because until the autostart task is fixed a reboot runs
`up -d` from the old tree and would otherwise revert OCR. Both diffs are additions only
(`66a67,73` and `64a65,71`); no existing line was changed. Backups taken first
(`.env.lan.pre-ollama-20260913`, gitignored by `.gitignore:92`).

Keys: `OCR_ENABLED`, `OLLAMA_API_URL`, `OLLAMA_API_KEY`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL`,
`OLLAMA_VISION_MODEL`. **Values were read from production's own `ai_providers` row, not invented:**
`base_url = http://192.168.170.8:11434`, `chat_model = qwen2.5:7b`, `embed_model = bge-m3:latest`,
`vision_model = qwen3.6:latest`. `OLLAMA_API_KEY` left empty (local endpoint). `ISSABEL_*` deferred
to the scheduler mini-release, as decided — 533/534 are not in this release, so the importer cannot
run regardless.

Confirmed inside the new container after the deploy: `OCR_ENABLED=true`, all three model keys and
the URL set, `OLLAMA_API_KEY` and `ISSABEL_CDR_HOST` empty.

**Two notes.** (a) `OCR_ENABLED` now appears **twice** in each file — the original line 53 plus the
appended block, which is what "append, touch nothing else" produces. Compose takes the last
occurrence, so both trees are effectively `true`; but file B still reads `false` at line 53 and will
mislead anyone who reads only the top. (b) OCR still cannot work: `ai_providers.ollama` declares
`capabilities = {chat,embeddings}` and no `vision`, despite having `vision_model` set. That third
blocker lives in the database, not in `.env.lan`.

---

## Other decisions executed

- **Test user deleted** (decision 4). `mohammadtest@afrakala.local` removed through the GoTrue admin
  API after 531 landed. Verified: `auth.users 0 · profiles 0 · user_roles 0`, and the two
  `user_registered` audit rows **survive with `actor_id = NULL`** — `ON DELETE SET NULL` did exactly
  what it should: the account is gone, the audit trail is not.
- **Step 8** — six scripts committed on `main` as `9bc8d554`, pushed to `main` and to `staging`
  (`3bc526c4..9bc8d554` both). `start-afrakala-lan.ps1` went in **as-is**, hardcoded paths and all.

---

## Six refusals, and what each caught

| # | block | what was wrong | what it would have cost |
|---|---|---|---|
| 1 | 1 (first emit) | `psql` lines carried no `PGPASSWORD` | every DB block would have exited 2, uncomparable to its `Expect:` |
| 2 | 1 (first emit) | `Expect:` named `prod_rehearsal_e4b`; 533's http branch is guarded on `current_database()='postgres'` | on production the opposite branch runs — `http` and eight cron jobs installed against expectations measured on the path not taken |
| 3 | 2 | runbook said "exactly 5 scripts"; the inventory is 4 unique run scripts + 2 manual = 6 | an arbitrary file dropped to satisfy a wrong count |
| 4 | 6 | 11 of 14 migration files absent — repo at `d60232f5`, release built from `3bc526c4` | `MISSING FILE` at Block 9 after three migrations had already applied |
| 5 | 28/29 | Block 28 overwrites `:lan` **before** Block 29 tags `lan-rollback` | the rollback name would point at the new image; the running image would be left untagged |
| 6 | 29 | the corrective re-tag was **not** "the same digest" — `:lan` had already moved | rollback name moved forward anyway; recovered by re-pinning `8b04c479e022` |

---

## Release-line defects for the next emit

1. **Checkout state.** `emit-blocks.ps1` must open the runbook with a block asserting `HEAD` equals
   the build sha **and** that every migration file in the set exists on disk, before any `Expect:`
   is compared. Both are provable; neither was asserted.
2. **Rollback ordering.** It must (a) tag the currently-running image as `lan-rollback` **before**
   the `docker load`/tag block, (b) **not** re-tag `lan -> lan-rollback` after it, and (c) assert at
   the end that `lan` and `lan-rollback` resolve to **different** image ids, failing the block if
   they match.
3. **Tarball tag.** The archive is saved carrying `afrakala-app:lan`, not `afrakala-app:<sha>`, so
   the runbook's `docker tag afrakala-app:3bc526c4 ...` line fails with `No such image`. Either
   `build.ps1` saves under the sha tag, or `emit-blocks.ps1` reads the loaded id from `docker load`
   output. **Block 28's `Expect:` was still met** (`loaded id = 296eb4b4899f`) despite the failing
   line.
4. **Physical size is not a gate.** Already fixed in the `b` emit: a live database is always larger
   than a restore of it (467 MB vs 351 MB while the ledger matched exactly), and treating that as a
   failed expectation stopped a correct run at Block 1.

---

## Still open after this release

1. **OG-A open item** — the daily-capital snapshot path, 7 days stale (above).
2. **Blocks 3/4** — the autostart tree ops runbook, elevated, owner-typed.
3. **`ISSABEL_*`** — deferred with 533/534 to the scheduler mini-release. `call_logs` and
   `call_log_extensions` stay at 0 rows until then.
4. **OCR** — `ai_providers.ollama` must declare `vision` before receipt OCR can resolve a candidate,
   independent of `OCR_ENABLED` and the `OLLAMA_*` keys.
5. **336 / 343** — HUMAN REVIEW, no ledger rows, superseded in effect by 527 / 528.
6. **`OCR_ENABLED` duplicated** in both `.env.lan` files; file B still reads `false` at line 53.
7. **Sign-off (Block 33)** — og81 / og102 / og103 and the smoke and cold-gate lines are the owner's
   to tick by hand on the real target. og81's raw result is FAIL **by design** on a target carrying
   OG-J and OG-L; what must hold is the reconciliation, not a raw pass.
