# CHAINED EXECUTION — PROGRESS

The continuity file that `AFRAKALA CHAINED EXECUTION — v3` sections A1.1 and A1.2 make
the backbone of the run. **It did not exist when v3 was handed over.** Every session so
far was told to re-read it first and none could. It is created here, from measurement,
so a fresh session can resume from the HANDOFF STATE block alone.

Per-gate detail stays in `00-progress.md`; this file holds only the chain's own state.

## HANDOFF STATE

```
Document in force:    AFRAKALA CHAINED EXECUTION - v7
Last verified SHA:    see the first line of this mission's completion report, which is the
                      raw `git log --oneline -2 origin/staging` taken after the merge (A0.8).
                      Branch: feature/security-trio-og31, cut from staging @ 4e128726.
Mission just done:    **Mission 4 - security trio + OG-31.** Migration 393.
Phase 2 position:     OG-46 (#347), M12 (#348), 0-LOCAL (#349), M8 (#350), OG-60 (#351) and
                      now mission 4 are complete. **Next in v7's order: mission 5 - M10**,
                      which v7 itself flags as a DEFINITION CONFLICT that must be settled
                      first: the only in-repo definition is a batched EXECUTE revoke across
                      ~746 functions, while the owner's recorded answer is "documentation
                      only, no UI lock". Per A2.6 do not guess - ask. **But see
                      RECOMMENDATION: OG-62 is a live price leak and should outrank M10.**
Environment:          Local - proven, not assumed (both v7 STOP-block commands pasted in the
                      mission progress file).
Migration:            393 applied to afrakala; PostgREST restarted. Next free number is 394.
                      NOT inserted into supabase_migrations.schema_migrations - 388-392 are
                      all absent too, so 393 follows the existing convention. Reconciling
                      that ledger remains v7 Phase 4's item.
OG-31:                **CLOSED.** The FUNCTIONS default tap is shut for `public` and for
                      `public` only. Six per-schema restores stop the global row reaching
                      extensions/graphql/pgbouncer/pgsodium/pgsodium_masks/vault. Nothing
                      existing was revoked: 741 anon-executable of 840, identical either
                      side of the migration.
OG-44:                **CLOSED.** This mission owns is_viewer_only. The gate pins its
                      security properties AND asserts behaviourally that it still
                      discriminates - the thing migration 387 could only reach indirectly.
OG-45:                **CLOSED by assertion**, and measured down two levels: there is no
                      grant to revoke (the access is pg_read_all_data), it is two grants
                      away not one for two of the eight views, and with both grants made
                      all eight still return ZERO rows because the role carries no JWT and
                      386's predicate closes them. M4's OG-26 fix had already neutralised it.
OG-38:                **STILL OPEN - the owner's, deliberately untouched.** New fact for the
                      decision: the role has **no password**; it can only authenticate via
                      the `127.0.0.1 trust` line inside the db container. But it reads every
                      base table freely (persons 84, payment_receipts 10, measured), so the
                      question is not the EXECUTE grant - it is whether a passwordless
                      BYPASSRLS reader should exist at all. **This mission is CONDITIONAL
                      on it.**
Gates raised:         THREE. OG-61 (batched revoke over the 741 - the function-side twin of
                      OG-30, and a deliberately weak case). **OG-62 (LIVE: two definer
                      functions return real sale prices to an anonymous caller).** OG-63
                      (LIVE: purchases are impossible for 3.5 hours every Tehran night
                      because CURRENT_DATE is UTC).
e2e:                  RAN - privileges changed. 522 passed / **43 failed** / 29 skipped in
                      25.6 min, health-checked and locked. **43 is not a regression and the
                      whole delta is accounted for:** 29 of the recorded 30 still fail, 1
                      recovered (duplicate-mobile-blocked:59, the known UI race), and 14 are
                      new - every one of them in purchase/*, all of them OG-63. **393 was
                      exonerated by experiment**, not by argument: reverted live via
                      393-down.sql, PostgREST restarted, two of the 14 re-run and failed
                      identically, then 393 re-applied and re-verified. Baseline NOT
                      superseded - no spec changed; it remains the recorded 30.
                      payment_receipts 10 before and after; chrome-headless-shell 0 and 0.
typecheck:            **70, the exact baseline**, across the same 6 files
                      (lib/accounting/functions.ts, lib/audit/index.ts,
                      lib/invoices/functions.ts, _app.admin.automation.tsx,
                      _app.admin.sales-reminders.tsx, _app.products.index.tsx).
Build:                Not run and not required - zero src/ files changed.
Production touched:   NO. 192.168.170.10 was not contacted.
RECOMMENDATION:       **Do OG-62 before M10.** It is a live disclosure of real sale prices to
                      anonymous callers, against an A8 classification that already says
                      price is never public, and the fix is the same shape as migration
                      390's. OG-63 is the other live one and is a user-facing outage window.
Rotation verdict:     **GOOD rotation point.** Nothing is mid-flight: the migration is
                      applied, committed and merged, the gate is attacked and green, the
                      e2e delta is explained and attributed, and the next mission is
                      deliberately not started. The three new gates are recorded with full
                      evidence, so a fresh session can act on them from the gate log alone.
```

## LESSONS

Started 2026-08-26 per A1.4b. Read this section at the START of every mission alongside the
HANDOFF STATE. Numbered items are RULES promoted after a third strike; unnumbered ones are
single observations that have not yet earned rule status.

### From mission 4 - security trio + OG-31

- **A failing-set delta is a question, not a verdict, and the answer is an experiment.**
  This run showed 43 against a baseline of 30. The error-signature census (zero `42501`,
  zero permission denials, 41 timeouts) pointed away from the migration, and reproducing
  the failures on an idle machine ruled out machine load. Neither was treated as proof: the
  migration was **reverted on the live database**, the tests re-run, they failed
  identically, and only then was it exonerated. A signature is a hypothesis; a revert is
  evidence. This is the shape OG-43's row used for migration 388, and it should be the
  default whenever a mission's run differs from the baseline.
- **e2e failures can be a function of the clock.** OG-63 is invisible for 20.5 hours a day
  and fails 14 specs for the other 3.5. Before attributing new failures to a change, check
  what time the run started - every earlier baseline run was taken earlier in the day.
  Record the wall-clock start time of a suite run alongside its counts.
- **A disturbance that errors while being built has caught nothing.** D11's first form
  failed on a view dependency, so the gate never ran; scoring it CAUGHT would have been a
  false positive. A2.12(d) exists for exactly this and it fired on the first real use.
  Always print the perturbed state before running the gate.
- **Dry-run the gate, not only the change.** The first draft of check C2 had a SQL scoping
  bug - a comma-join mixed with an explicit `JOIN`, so the outer alias was invisible in the
  `ON` clause - which would have failed the migration on a healthy database. The A5.28 dry
  run caught it, and the same bug was present twice in the rollback file.
- **A count in a mission brief is a claim with a timestamp.** Every number v7 stated for
  this mission had drifted or was mis-stated: 91 policies -> 93 (the chain's own migrations
  391/392 added them), 740 -> 741, and "345 SECURITY DEFINER" was really the
  anon-executable definer count; the definer count is 427. A2.13 is not a formality.
- **"anon can EXECUTE it" is an upper bound on exposure, not a measurement of it.** 14 of
  the 18 highest-risk definer functions refuse from inside their own bodies. Reporting 741
  open functions without saying so would have been true and badly misleading - and it is
  why OG-61 is written as a weak case rather than an urgent one.
- **Measure the prize, not just the door.** OG-45 was framed as one GRANT away from eight
  sensitive views. Granting it yielded **zero rows** from all eight, because another
  mission's fix had already closed the NULL-uid path. The base-table control in the same
  session is what stopped that becoming a false all-clear: the role reads everything else
  freely, it simply does not need those views.
- **When a global setting has a blast radius, look for the per-scope restore before
  escalating it to the owner.** OG-31's row called its blast radius "an owner decision, not
  an agent's". Measured, it was worse than recorded - every role stripped, and a fifth
  schema nobody had listed - but a six-line per-schema restore confined it exactly, and the
  containment is assertable. The question never had to be asked.

## THE EXECUTION ENVIRONMENT IS NOT THE TEST COMPUTER — *(HISTORICAL: describes the M12 session of 2026-08-25, NOT the current one. The 0-LOCAL session that followed ran on the test computer with full database access — see HANDOFF STATE above. Kept because it is the evidence behind OG-58.)*

That session ran in an ephemeral Linux cloud container holding a fresh clone of the
repository and nothing else. It is **not** `D:\AfraKalaTest\app`. Measured, not assumed:

```
192.168.170.8:9000   (LAN web)     -> UNREACHABLE
192.168.170.8:5432   (LAN db)      -> UNREACHABLE
192.168.170.8:11434  (Ollama)      -> UNREACHABLE
https://api.test.myafrakala.ir/    -> 403 at the proxy CONNECT
                                      "connect_rejected ... policy denial"
docker info                        -> daemon DOWN (no /var/run/docker.sock)
psql                               -> binary present, no reachable server
node_modules                       -> 0 entries
```

`192.168.0.0/16` sits in the proxy's `noProxy` list, so a LAN address is attempted
directly and simply has no route from this container. The 403 is a network-policy
denial, not a certificate or tooling fault.

**Consequence, stated plainly because A0 requires it:** every remaining Phase 2 mission
is gated on live measurement — `pg_get_functiondef`, `has_column_privilege`, a two-sided
gate applied to the `afrakala` database, an e2e run against the deployed build. **None
of that can be executed from here, so none of it may be reported as done.** Repository
reading, code auditing and document work are the whole of what this environment can
honestly deliver.

A4.18's health pre-check, A4.19's ceiling and A4.20's lock are all moot here: there is no
suite to run. A3.15's independent review is also unavailable — this session is directed
not to spawn subagents, so any review would be self-review, which A3.15 forbids naming as
independent.

## PHASE 0 — WHAT WAS MEASURED, AND WHAT IT REFUTED

Step 0 state sync, real output:

```
$ git fetch origin && git log --oneline -3 origin/staging
3d7fda09 Merge pull request #347 from .../feature/og46-write-half
b6c7e107 docs(og46): record the new 30-failure baseline and the direct-push incident
7d40241e test(og46): complete the write half sustainably, and defer what needs a posted fixture
```

PRs #345, #346, #347 all carry a real `merged_at` (2026-08-25 at 10:17:44, 12:00:32 and
14:42:53 UTC). v3's reconciliation is correct: Phase 2 mission 1 is complete.

### Finding 1 — this file was missing, on every branch

```
$ git ls-tree -r --name-only origin/staging origin/main origin/lovable/ui-staging -- docs/execution | grep -i chained
(no match on any of the three)
```

A1.1 orders it read at the start of every mission and A1.2 orders it written at the end
of every one. Neither has ever happened. That is the mechanical reason the chain has been
restarting from v3's own status lines — the thing v3 says not to trust.

### Finding 2 — M12, M8 and M10 have no definition in this repository

v3 sends missions 2, 3 and 5 to "the master prompt". That prompt is not in the repo:

```
$ grep -rln "\bM12\b" --include="*.md" .   -> docs/execution/ledger-decisions.md   (only)
$ grep -rln "\bM10\b" --include="*.md" .   -> m3-function-execute-leak-PROGRESS.md,
                                              og25-anon-default-privileges-PROGRESS.md,
                                              00-progress.md
$ grep -rn  "^#+.*\bM8\b" --include="*.md" .  -> no heading anywhere
```

- **M12** exists only as an owner ANSWER — `ledger-decisions.md:534`, *"Do not reset the
  serial. Do not rename the module."* Both halves are no-change. What the mission is
  supposed to BUILD is nowhere.
- **M8** appears only as "the M8 probe used on the receipt side" (`00-progress.md:345`),
  a technique referenced by a mission whose text is absent.
- **M10** was already flagged as a discrepancy at `00-progress.md:412`: its only
  definitional mention scopes it as a batched EXECUTE revoke across 746 functions, which
  is a database mission with no UI surface, while the owner's Phase 1 answer is about
  documentation and a UI lock.

A2.6 is unambiguous — missing definition is stop-and-ask, never a guess.

### Finding 3 — OG-8's object is a FUNCTION, and its trigger was dropped a week ago

v3 mission 3 says *"drop the orphaned trigger `trg_post_receipt_on_approve`"* and
*"prove it is genuinely orphaned via `pg_get_triggerdef`"*. Both halves are wrong about
the object:

`trg_post_receipt_on_approve` is a **trigger function**, not a trigger. The trigger was
`trg_payment_receipts_post_journal`, and migration **336** dropped it on 2026-08-18
together with `post_receipt_journal`. That migration's own SCOPE NOTE states the rest:

> After this migration `trg_post_receipt_on_approve()` is unreferenced dead code whose
> body calls a dropped function. It is harmless (nothing can invoke it) but it is dead.
> It is NOT dropped here because OG-2 names only two objects and this migration does not
> exceed the owner's written authorisation.

So `pg_get_triggerdef` has no trigger to describe. The correct proof is
`pg_get_functiondef` plus zero rows in `pg_trigger`/`pg_depend` referencing the function,
and the rollback is recreated from `pg_get_functiondef`, not from a trigger definition.

Also on record: **OG-8's answered cell is EMPTY** (`00-progress.md:333`, raised
2026-08-18, verdict "raised in task 1.1"). v3 calls it "the assigned OG-8 closure", which
reads as the owner assigning it — but the drop crosses CLAUDE.md rule 15 and exceeds
OG-2's written authorisation, so it is listed below for one-line confirmation rather than
assumed.

### Finding 4 — OG-35 is not unwired, and its header spelling conflicts with the repo

v3 mission 6 predicts "built but never wired up" and calls the page error "possibly a
missing configuration". Measured, it is neither. There are two separate Asan paths:

| Path | State | Reached from |
|---|---|---|
| `src/lib/asan/*` — layouts 1-4, `write-xlsx`, journal, bank-deposit, sales, purchase | **BUILT** | `/admin/asan-export` |
| `src/lib/export/export-modes.ts` | **A DELIBERATE REFUSAL** | `_app.accounting.receipts.tsx:181` |

The «قالب پیکربندی نشده است» message comes from `AsanLayoutNotConfiguredError` in
`export-modes.ts:72`, raised by `createUnconfiguredAsanAdapter`, whose header comment says
in terms: *"⚠️ INTENTIONALLY REFUSES TO PRODUCE OUTPUT ... do not guess the Asan column
layout, because a wrong layout that silently imports into the owner's accounting software
is worse than no feature."* It is a placeholder waiting for exactly the specification v3
now supplies — so OG-35 is a BUILD task on a live seam, not a configuration fix. The
surface showing it is the **accounting receipts page**, not `/admin/asan-export`.

**And the supplied specification contradicts what is already shipped.** v3's Template 1
gives columns C and D as `Name_Moshtare` and `Shopmare_Peygeri`, adding *"the misspelling
'Shopmare' is legacy-intentional; do NOT correct it"*. The repository says otherwise in
five places, consistently:

```
src/lib/asan/layouts.ts:77-78        "Name_Moshtari", "Shomare_Peygiri"
src/lib/asan/export-bank-deposit.ts:9        same two, named in the contract comment
src/lib/asan/export-bank-deposit-rows.ts:39-40   same two, on the row builder
e2e/asan/export-bank-deposits.spec.ts:98-99     same two, asserted
e2e/asan/export-shell.spec.ts:277-278           same two, asserted
```

and `export-bank-deposits.spec.ts:27` goes out of its way to say the transliteration is
*"reproduced **exactly** — `Name_Moshtari`, not 'Name_Moshtary'"*. `layouts.ts` opens with
*"Order and text are reproduced character for character. A header that merely looks right
imports into the wrong column."*

Three characters differ (`Moshtari`/`Moshtare`, `Shomare`/`Shopmare`, `Peygiri`/`Peygeri`)
and they decide whether a file lands in the right column of live accounting software.
Two owner-sourced statements disagree; an agent picking one is precisely what A2.6
forbids. Two smaller deltas ride along: v3 says Template 1 serves **payments too** with a
left-signed negative `Mablagh`, and that G-O exist as empty strings to `max_col=15` — the
shipped layout is six columns and deposit-only. The Toman x10 -> Rial rule v3 states is
already implemented (`tomanStringToRial`, asserted at `export-bank-deposits.spec.ts:143`).

### Finding 5 — mission 7's premise, checked as A2.13 requires

v3 asks whether `src/features/ledger-wizard/lookup.ts` passes the Asan code to
`person_find_by_identifiers` or only the mobile. The file exists and calls the RPC at
line 25; `src/lib/persons/find-by-phone.ts:86` is the second caller. **The argument-level
answer is not recorded here** — reading two call sites tells you what is passed, but
whether the RPC consumes it needs `pg_get_functiondef` against the live database, and
that is unreachable from this container. Recorded as `[U]`, with the file locations
established so the next session on the test computer can settle it in one query.

## STOP-AND-ASK — open, blocking, for the owner

| # | Question | Why it cannot be defaulted |
|---|---|---|
| 1 | Where is the master execution prompt, or what are M12, M8 and M10? | A2.6. Three missions have no task text in the repo. M12's only trace is an answer that changes nothing. |
| 2 | M10 — the batched EXECUTE revoke, or the posted-document edit surface? | The Phase 1 answer and the only in-repo definition describe different missions. Recorded as a discrepancy since 2026-08-25. |
| 3 | OG-35 bank headers — `Name_Moshtari`/`Shomare_Peygiri` as shipped, or `Name_Moshtare`/`Shopmare_Peygeri` as v3 states? | Both are owner-sourced. A wrong header imports into the wrong column of live accounting software. |
| 4 | OG-35 — does Template 1 also carry bank PAYMENTS with a negative `Mablagh`, and should columns G-O be emitted as empty to `max_col=15`? | The shipped layout is deposit-only and six columns. This widens a verified contract. |
| 5 | OG-8 — confirm dropping the dead FUNCTION `trg_post_receipt_on_approve()`. Its trigger went with migration 336. | The gate's answered cell is empty and the drop exceeds OG-2's written authorisation (CLAUDE.md rule 15). |
| 6 | Which machine executes the chain? | This container reaches neither the LAN test server nor the app over HTTPS. Every remaining mission needs the live `afrakala` database. |

## History

| date | tool | what changed | commit |
|---|---|---|---|
| 2026-08-25 | Claude Code | Created this file. Phase 0 state sync and premise audit; four v3 premises refuted or unfound; six blocking questions raised. No src/, no migration, no data. | a94dc45a |
| 2026-08-25 | Claude Code | M12 repository half. OG-9 and OG-12 answered with evidence; OG-57/58/59 raised; `docs/research/m12-serial-and-module.md` written. Live half explicitly NOT done — no psql ran. No src/, no migration, no data. | (this commit) |

---

# MISSION 0-LOCAL — 2026-08-25

The live half of M12. M12 (PR #348) answered OG-9 and OG-12 from repository evidence
only, executed from a cloud container that could not reach the database (OG-58), so
every conclusion carried a **PROVISIONAL** stamp. This mission removes those stamps —
or would have contradicted them, which is exactly why A5.28 requires the step.

Full evidence with raw command output: `docs/research/0local-live-confirmation.md`.

## Result

| Item | Before | After | How |
|---|---|---|---|
| OG-9 | ANSWERED, PROVISIONAL | **CONFIRMED LIVE** | `pg_get_functiondef` on both serial functions |
| OG-12 | ANSWERED, PROVISIONAL | **CONFIRMED LIVE** | `SELECT DISTINCT module` + two-way census |
| OG-59 | OPEN (drift suspected) | **CLOSED — no drift** | `to_regclass`/`to_regproc` both NULL |
| OG-57 | OPEN | OPEN, re-confirmed live | reverse census still names it alone |

Nothing was contradicted. All three of M12's provisional conclusions survived live
measurement.

## What measurement ADDED beyond confirming

**A second serial mechanism, and it is the one that raised OG-9.** M12's record names
only `asan_export_numbers`. Live measurement found `document_numbers` +
`assign_document_number` (migration 338) also present — and migration 338's own header
comment is where OG-9 was flagged in the first place; it only *mentions* the asan
function in prose. Both mechanisms mint `COALESCE(MAX(...),0)+1 WHERE doc_type =
_doc_type`, both put the Jalali year in the display string only, and both carry a
`UNIQUE (doc_type, serial)`-shaped constraint with no year column. So the owner's "do
not reset" answer holds across the whole serial surface, and a reset remains a schema
migration rather than a code change in both places.

This is A2.13 doing its job: the mission's own recorded premise was narrower than
reality, and planning on the row's text alone would have left half the surface
unverified.

## Rule correction — A5.32 on `has_dynamic_permission`

A5.32 states *"a module with no `role_permissions` row is **open to all roles**."*
The live function body shows that is true **only for `view`**. The fallback is a graded
legacy matrix:

| action | roles admitted when no row exists |
|---|---|
| `view` | admin, manager, accountant, sales, viewer — *all five; shorthand holds* |
| `create`, `update` | admin, manager |
| `delete` | admin |
| `approve`, `export` | admin, manager, accountant |
| `view_sensitive` | admin, manager, accountant |

A NULL `_user_id` returns `false` before any of this, so anon gets nothing.

This changed no decision here — the forward census found no unseeded module — but it is
recorded because the shorthand would lead a future mission to treat an unseeded module as
a wide-open **write** door. It is not; writes fall back to admin/manager.

## Observation, not acted on

The `Open Owner-Gates:` summary near the top of `00-progress.md` is **stale**: it lists
23 open gates ending at OG-37, while the gate table below it now runs to OG-59. It was
already stale before this mission. Recomputing all 59 statuses is error-prone and outside
this mission's scope, so it was left alone and is flagged here instead of being silently
"fixed" or silently ignored. The gate **table** is the authority.

## Scope and verification

- **Migration:** none written, none applied. Every query was `SELECT`-only, so
  `docker restart afrakala-lan-rest` was not required (A5.29 conditions it on an applied
  migration) and was not run.
- **RLS/RBAC impact:** none. No policy, grant, role or privilege was changed.
- **Audit log impact:** none. No data was written.
- **e2e:** correctly skipped per A4.16 — no `src/`, no spec, no privilege changed.
- **typecheck:** not run per A7.39 — zero files under `src/` changed.
- **Data:** no row inserted, updated or deleted.
- **production لمس نشد** — `192.168.170.10` was not contacted.
