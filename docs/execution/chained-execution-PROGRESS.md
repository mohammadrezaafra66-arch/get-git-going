# CHAINED EXECUTION — PROGRESS

The continuity file that `AFRAKALA CHAINED EXECUTION — v3` sections A1.1 and A1.2 make
the backbone of the run. **It did not exist when v3 was handed over.** Every session so
far was told to re-read it first and none could. It is created here, from measurement,
so a fresh session can resume from the HANDOFF STATE block alone.

Per-gate detail stays in `00-progress.md`; this file holds only the chain's own state.

## HANDOFF STATE

```
Document in force:    AFRAKALA CHAINED EXECUTION - v9
Last verified SHA:    origin/staging @ d21bc083 (PR #357). **Mission 10 is COMMITTED AND
                      DEPLOYED BUT NOT MERGED** - branch feature/og65-asan-bank-template @
                      1da2a778, pushed. It is held on ONE step, below.
Mission just done:    **Mission 10 - OG-65, the Asan bank template.** Code complete, gate
                      attacked, built and deployed to the LAN web container. **NOT MERGED.**
BLOCKED ON:           **The full e2e run, which A4.16 requires because src/ and specs both
                      changed - and A4.18's health check FAILS on idle CPU.**
                      Measured: mean 37.7% / median 39% / max 62% over a settled 60s window,
                      against a ~25% threshold. The other two criteria PASS
                      (chrome-headless-shell = 0; /login 200 in 0.18s).
                      **Cause identified, and it is not this chain's doing:**
                      `dllhost.exe /Processid:{DFB65C4C-B34F-435D-AFE9-A86218684AA8}`,
                      PID 17904 - a Windows shell/thumbnail COM surrogate - running since
                      **2026-08-16** and holding **84.2 CPU-hours**, currently ~39% of a
                      core. Second consumer: a user `chrome` PID at ~25%.
                      A4.18 says do not start the run; fix the environment or report. Killing
                      a Windows system process on the owner's machine is not an agent's call,
                      so it was reported instead. **The owner's answer unblocks the merge.**
                      Everything else in mission 10 is complete and verified.
Environment:          Local - proven. **APP_GIT_SHA has MOVED for the first time:**
                      a19fd811 -> **1da2a778**, equal to HEAD, as A7.40 predicted for the
                      first src/-changing mission. Image afrakala-app:lan rebuilt, web
                      container Up (healthy), /login 200. `build.ps1 -Force` was needed
                      because three untracked leftovers from an earlier session trip its
                      dirty check; the script's own `-dirty` stamp test uses
                      `--untracked-files=no`, so the image is stamped cleanly - verified.
Migration:            NONE this mission. Next free number is still 396 (verify on disk AND
                      remote before writing).
OG-65:                **CLOSED by code.** Headers corrected to the MEASURED spelling
                      `Name_Moshtare` / `Shopmare_Peygeri`; sheet padded to 15 columns with
                      G-O as empty STRINGS (null writes no cell at all and would yield a
                      six-column file); direction now carried in the SIGN of `Mablagh` in
                      layout 4 only. Template 2 measured identical to what ships - untouched.
                      **Two e2e specs had ASSERTED the wrong headers**, one calling them
                      "reproduced exactly" - a test asserting a wrong value defends the bug
                      rather than catching it. Both corrected with the reason in place.
OG-67 (NEW):          **RAISED.** Nothing feeds bank PAYMENTS into the bank template.
                      `asan_list_bank_deposit_export` reads `payment_receipts` and returns no
                      direction column; payments still route to template 2 via
                      `asan_list_journal_export`. The MAPPING supports payments and the gate
                      proves both directions on constructed rows, but no data source does.
                      Wiring one needs an RPC change - outside the owner's
                      `src/lib/asan/`-only scope - and it is a ROUTING change, not plumbing.
Gate attack:          1 control + **12 disturbances, all CAUGHT**, including the "corrected"
                      spelling, a null padding, a negative reaching template 2, and **an
                      amount returned as a formatted string** - the first mission in this
                      chain where A2.12(b)'s numeric-as-string class has a real attack
                      surface, every earlier gate having made only catalogue/SQL checks.
                      **D10 failed to CONSTRUCT on its first form and was rebuilt, not
                      counted** (A2.12d, second firing in this chain).
e2e:                  **NOT RUN.** See BLOCKED ON. Targeted runs of the two changed specs did
                      pass: 42 passed / 1 failed, the single failure being the known baseline
                      entry `asan/export-bank-deposits`. **Line-number shift to expect in the
                      next full run's SET comparison:** this mission added lines to
                      `export-bank-deposits.spec.ts`, moving that baseline failure from
                      **:108 to :133**. It will look like one recovered + one new. It is an
                      editing artefact, not a behaviour change - do not read it as a
                      regression.
typecheck:            **70**, the exact baseline, same 6 files - re-run because src/ changed.
Build:                DONE and deployed (see Environment).
INDEPENDENT REVIEW:   **STILL OWED** - missions 4, 5 and 6, deferred by the owner to a
                      separate session. Do not lose this.
Production touched:   NO. 192.168.170.10 was not contacted.
Rotation verdict:     **NOT a clean rotation point** - mission 10 is mid-flight: committed,
                      pushed and deployed, but unmerged and awaiting one owner answer about
                      the machine. A fresh session can resume from this block, but should
                      resolve the CPU blocker and run the full suite before merging.
```

## LESSONS

Started 2026-08-26 per A1.4b. Read this section at the START of every mission alongside the
HANDOFF STATE. Numbered items are RULES promoted after a third strike; unnumbered ones are
single observations that have not yet earned rule status.

### From mission 10 - OG-65

- **A test that asserts a wrong value defends the bug.** Two e2e specs asserted
  `Name_Moshtari`/`Shomare_Peygiri`, one of them commenting that the transliteration was
  "reproduced **exactly**". They did not merely fail to catch the wrong headers - they made
  the correct fix look like a regression, and they are the reason it shipped that way for
  months. When a spec and an external artefact disagree, the artefact is the authority and
  the spec is a claim; measure the artefact.
- **`null` and `""` are not interchangeable when writing a spreadsheet.** `aoa_to_sheet`
  writes no cell at all for `null` and a real empty cell for `""`, so padding with `null`
  produces a six-column file that looks correct in a code diff and is the wrong width in the
  target system. Assert the CELL TYPE, not just the count.
- **A2.12(b)'s numeric-as-string disturbance finally had a surface, and it caught something.**
  Every earlier gate in this chain recorded that class as inapplicable because it made only
  catalogue and SQL checks. This gate reads spreadsheet cells, so `"-15000"` versus `-15000`
  became a real attack - identical in the file, not summable in Excel. When a gate's medium
  changes, re-read the attack protocol rather than carrying forward "not applicable".
- **State the scope boundary as a gate, not as a silent half-build.** The mapping supports
  bank payments; no data source feeds them. Shipping that without saying so would let
  "payments work" read as more than it is. OG-67 records exactly where the capability stops
  and why crossing the line needed a decision.
- **A4.18 is a precondition, not a formality, and the blocker was not ours.** Idle CPU came in
  at 37.7% against a ~25% threshold, traced to a Windows thumbnail COM surrogate running
  since 2026-08-16 with 84 CPU-hours. The suite was NOT started. Note the other two criteria
  passed, including `/login` at 0.18s - responsiveness looked fine while the machine was
  loaded, which is precisely how the 4.7-hour invalid run happened before.

### From mission 9 - task 6.7 / M2

- **"Confirm against the real file" can close a question the previous session could not.**
  The claim that `lookup.ts` sends only the mobile had been carried as `[U]` since
  2026-08-25 because the argument-level half needed the live database. One file read plus
  one `pg_get_functiondef` refuted it outright - the Asan code is passed, and tried FIRST.
  Unverified claims survive by being expensive to check; they are usually cheap once the
  environment is right.
- **A missing feature and a missing column are different problems.** "Search must match
  city" reads like a feature gap. Measured, the person core has no city at all and city
  lives on the role tables - so it is a data-modelling decision that CLAUDE.md's phase rule
  has an opinion about, not something to bolt on. Check where the data IS before estimating
  the work.
- **Two audits in a row turned build missions into question missions.** OG-35 and this one
  both arrived briefed as "build X" and measured as "X mostly exists; a small decision
  blocks it". That is now the expected shape on this project, not a surprise - budget Phase
  0 accordingly and resist writing code before it is done.

### From mission 8 - OG-35

- **Audit the wiring before believing a specification is new information.** v8 supplied the
  Asan template layouts as "the source of truth, NOT in the repository". Measured, template 2
  already existed character-for-character and template 1 differed by three characters. A
  mission briefed as "build the Asan Excel output" is actually three narrow questions. A1.5
  says the problem here is almost never that the feature does not exist - this is the
  strongest instance of it yet, because the spec itself looked like the missing piece.
- **Two surfaces with similar names are not one surface.** `/admin/asan-export` has seven
  built exports; the accounting-receipts page has five deliberately unconfigured adapters
  from a DIFFERENT layout family (`ASAN_BRIDGE.md`). Wiring one to the other because both
  say "asan" would have produced a file that looks authoritative and imports silently into
  live accounting software - which is the exact failure the refusal was placed there to
  prevent. Read what an error actually throws before calling it a configuration gap.
- **A refusal in the code can be a decision someone already made.** `AsanLayoutNotConfiguredError`
  is not a bug or an oversight; its header explains the reasoning and defers to the owner.
  Treat a documented refusal as a recorded decision and look for its rationale before
  "fixing" it.

### From mission 7 - M10

- **A pre-answer is a conclusion plus a premise; verify the premise, keep the conclusion.**
  v8 told this mission to close M10 as *covered by OG-31* if the repository's only definition
  was the batch EXECUTE revoke. It was - and the conclusion (close it, no migration) was
  right - but the stated REASON was wrong, because migration 393 revoked nothing existing.
  Recording "covered by OG-31" would have left a false trail: a later reader would believe
  the existing-function revoke had been done. Applying the owner's intent while correcting
  the reason costs one paragraph and keeps the record true.
- **Closing a duplicate is worth more than closing a mission.** M10 and OG-61 were the same
  work under two names, and an open decision recorded in two places drifts. Merging the name
  into the gate that carries the evidence means the owner answers once.
- **Re-derive counts, never quote them.** The same population has been 746 (M3), 741
  (mission 4) and 713 (now, after 395 closed 28). Every one of those was correct when
  measured. A gate row that quotes a number is a gate row that will mislead somebody.

### From mission 6 - OG-62, the anon-reachable definer leaks

- **RULE 2 (promoted - third strike). Assert the EFFECT, never the identity of a grant.**
  Disturbance D10 granted a group role EXECUTE and made `anon` a member: no grant named
  `anon` anywhere (`grants_naming_anon = 0`) and `anon` still reached the function. Counting
  from this log: migration 375 was defeated by a PUBLIC grant and an inherited role, 379 was
  defeated by pinning set membership instead of the privilege set, and D10 here is the third.
  So it is a rule: **privilege gates use `has_*_privilege` (effect), never a scan of
  `proacl`/`relacl` for an entry naming the role.**
- **A row count is not a disclosure.** The sweep returned "47 functions returned rows to
  anon", which reads alarming and is nearly meaningless - `has_role(NULL,NULL)` returns one
  row containing `false`. Only a second pass, calling each with REAL arguments and looking
  at the VALUES, separated 28 genuine leaks from boolean RLS helpers. Reporting the 47 as
  leaks would have been true-sounding and wrong, and would have led to revoking the helpers
  that 93 RLS policies depend on.
- **When a verification fails for two reasons at once, fix both before relaxing either.**
  The forward→rollback ACL check failed with a mismatch that had a harmless cause (a
  REVOKE-then-GRANT re-appends the aclitem, so `proacl::text` re-orders) and a real one (two
  functions gaining a PUBLIC grant they never had). The tempting move - "it's just ordering,
  loosen the check" - would have shipped a rollback that left objects MORE open than it
  found them. Comparing the ACL as a SET separated the two causes instead of averaging them.
- **A rollback can be wrong in the opening direction, not just the closing one.** Every
  rollback in this chain so far restored too little or exactly enough; this one would have
  restored too MUCH. Assert the restored state as a set equal to the capture, in both
  directions - `EXCEPT ALL` each way - rather than checking only that nothing was lost.
- **Check the caller before believing an old research note.** `K-currency.md` names
  `InvoiceForm.tsx` as the consumer of `get_product_sale_price`. That file no longer exists,
  and neither price function has any `src/` caller today. A note is evidence of what was
  true when it was written (A2.13 applies to the repository's own documents too).

### From mission 5 - OG-63, the Tehran/UTC purchase-date defect

- **RULE 1 (promoted - third strike). A gate for a time-dependent defect must construct
  its own conditions, never wait for them.** The defect here is dormant 20.5 hours a day, so
  a gate that merely called the RPC would have PASSED against the broken code at almost any
  hour. The fix was to find a lever that recreates the condition on demand - `CURRENT_DATE`
  follows the session TimeZone while `tehran_today()` does not, so `SET TimeZone='Etc/GMT+12'`
  rebuilds the window at any wall-clock moment - and to pair it with a **vacuity guard** that
  fails if the condition was not actually built. Counting the strikes from this log: M4's
  gate 386 tested one direction only, mission 4's D12 showed an agreement check passing
  vacuously on an empty population, and this mission's D5 showed the same for a window that
  cannot be constructed. Third strike, so it is a rule: **every conditional assertion needs a
  guard proving its precondition held.**
- **A green suite is not evidence when the run misses the failure window.** The 14
  `purchase/*` tests went green here, exactly as the brief predicted - but at 11:00 Tehran
  they would have gone green on the *unfixed* code too. Reporting that as confirmation would
  have been the same reasoning error that hid OG-63 for as long as it hid. **Record the
  wall-clock start time of every suite run**, and when it falls outside a known defect
  window, say the run does not discriminate.
- **Structural checks cannot catch a semantic re-introduction.** Disturbance D2 called
  `tehran_today()`, contained no bare `> CURRENT_DATE`, and passed every grep-shaped check -
  while being the original bug, restored through an `OR`. Only the behavioural half caught
  it. When a fix is "replace expression A with expression B", assert the BEHAVIOUR, because
  asserting the text is exactly what a plausible-looking regression defeats.
- **When the body carries Persian, copy it - never retype it.** Migration 394 replaces a
  476-line function holding 31 distinct Persian-guarded error paths. The file was GENERATED
  from the live `pg_get_functiondef` capture with a single string replacement, so no Persian
  passed through a keyboard, and the applied `prosrc` md5 was then compared against the
  dry-run's to prove the delivery path changed nothing.
- **A probe that writes must roll itself back, and you must prove it did.** The gate has to
  CALL a VOLATILE, inserting RPC to prove behaviour. It goes through a `pg_temp` helper whose
  sub-transaction is rolled back in both directions - including the success path, which
  raises its own marker to force it. Proven, not assumed: `purchases` was 198 before and 198
  after the gate, both in the dry run and at apply time.

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
