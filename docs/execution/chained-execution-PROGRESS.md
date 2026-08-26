# CHAINED EXECUTION — PROGRESS

The continuity file that `AFRAKALA CHAINED EXECUTION — v3` sections A1.1 and A1.2 make
the backbone of the run. **It did not exist when v3 was handed over.** Every session so
far was told to re-read it first and none could. It is created here, from measurement,
so a fresh session can resume from the HANDOFF STATE block alone.

Per-gate detail stays in `00-progress.md`; this file holds only the chain's own state.

## HANDOFF STATE

```
Document in force:    AFRAKALA CHAINED EXECUTION - v10 (RUN TO PRODUCTION)
Mission just done:    **11 - OG-66 (party search) + its mandatory STEP 0 baseline settlement.**
                      See the completion report's first line for the merge SHA.
NEXT:                 **12 - gate clean-up** (OG-56, OG-57 close; OG-68/69 confirm-and-leave;
                      OG-38 read the monitoring window and REPORT), then **13 - OG-64**.
                      Neither is started.

=== STEP 0: THE BASELINE IS SETTLED, NOT SUPERSEDED ===
Mission 10's seven un-traced failures had ONE head, not seven causes:
`e2e/asan/import-persons.spec.ts` tore down person_identifiers then persons and died on
`suppliers_person_id_fkey`. A teardown that throws leaves its whole fixture behind, and that
residue moved the `asan_export_numbers` high-water marks two other specs assert against
(export-numbering:102 and export-shell:495 both got a number LOWER than the mark they had
just captured), emptied a fixture id (product-asan-code:118, 'invalid input syntax for type
uuid'), and shifted three more assertions. Fixed by clearing the ROLE tables first, scoped to
that test's own person ids -- never by marker or name, which would delete another spec's data.
Result: **zero new failures, a strict subset of the recorded 30.** No supersession needed.

=== e2e (this mission, post-change) ===
601 tests -> **543 passed / 29 failed / 29 skipped**, 22.4 min. Reconciles exactly at 601.
**601, not 598** - this mission added 3 tests, all passing:
  e2e/persons/wizard-name-lookup.spec.ts:63 / :81 / :96
Set vs the 30: **NEW <none>**; RECOVERED `persons/duplicate-mobile-blocked:59` (the known UI
race). `asan/export-bank-deposits:108 -> :133` remains a LINE-SHIFT ARTEFACT of mission 10's
edits - normalise it before comparing or it reads as one recovery plus one regression.
payment_receipts 10 before and 10 after. typecheck **70**.

=== OG-66: all three parts closed ===
(a) city  - DROPPED by the owner. Recorded; nothing changed; no column, no join.
(b) surname - ALREADY TRUE, proven not built: «تست» finds «محمدرضا تست» and «محمدی» finds
    «خان محمدی», both matched_by=name. It contains-matches already, so per A1.5 no code
    was written.
(c) ledger wizard WIRED to search_visible_persons as a UNIQUE-HIT fallback, after every
    exact identifier path misses. Ambiguous names are refused, not guessed, because
    `pickKind` resolves exactly one party. Visibility measured per role BEFORE wiring -
    admin/accountant/manager/viewer 36->84, sales 11->18 - and those are the same numbers
    the persons PAGE already shows that role, so this aligns two surfaces rather than
    granting new access. anon is refused outright.
    Gate: 9 disturbances + control, **8 caught**. D1 (ignore p_limit) ESCAPED and that is
    CORRECT, recorded as a principled escape: a unique name still returns 1 and an ambiguous
    one still returns >1, so the wizard's contract is unbroken - asserting it would pin an
    implementation detail. D6 failed to construct first (1/0 folded at creation) and was
    REBUILT, not counted.
    Gate ceiling stated honestly: lookup.ts imports the Supabase BROWSER client, so it is
    not testable from Node; the gate asserts the CONTRACT through PostgREST as a real role
    and says so rather than implying UI coverage.

=== ENVIRONMENT: read before any deploy ===
**APP_GIT_SHA = b17b267c** (moved again this mission; rebuild + deploy were done).
**THE DEPLOY COMMAND CHANGED. CLAUDE.md and AGENTS.md rule amended together, verified
identical:**
  docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml \
    up -d --no-deps --build web
**Without `--no-deps` the app goes DOWN** - this mission proved it by doing it. web ->
kong -> (auth, rest, storage, meta) -> db-role-fix, and that one-shot container cannot start
on this machine (OG-68's mount fault), so web was left `Created` and /login returned 000.
Recovery: `docker start afrakala-lan-web`.
**docker cp is still broken** - deliver over `docker exec -i` with a Buffer, verify md5.
**OG-70 (NEW): cold recovery is broken.** db-role-fix creates the service roles, its script
arrives by a FILE BIND (the dead class), and auth/rest/storage/meta depend on it with
`service_completed_successfully` - the STRICT condition. So a from-scratch `up -d` would
leave four core services unable to start. Nothing is wrong today: the job ran on 2026-08-02
and its effects persist in the named volume - verified live, all roles/attributes/passwords
correct. **The backup covers the DATA but a restore would land in a stack whose roles cannot
be created, so the backup alone is NOT a recovery plan.** Owner decision.
**Do NOT restart afrakala-lan-db, do NOT --force-recreate, do NOT delete db-role-fix or edit
its script.**

=== OWED ===
INDEPENDENT REVIEW of missions 4, 5, 6 - still owed, needs a separate session (A3.15).
PHASE 1 QUESTIONS - the five v10 names (Phase 7 items, Phase 8 items, OG-61, OG-67, and the
OG-6 reminder) have NOT yet been put to the owner. Read MASTER-CHECKLIST.md first, then ask
ONCE in one Persian message, and do not hold the chain waiting for the answer.
OPEN GATES: OG-6, OG-30, OG-38, OG-53, OG-56, OG-57, OG-61, OG-64, OG-67, OG-68, OG-69,
OG-70.
Production: **NOT touched. 192.168.170.10 was never contacted.**
```

## LESSONS

Started 2026-08-26 per A1.4b. Read this section at the START of every mission alongside the
HANDOFF STATE. Numbered items are RULES promoted after a third strike; unnumbered ones are
single observations that have not yet earned rule status.

### From OG-61 - the disturbance that became the attack

- **RULE 8 (owner-directed 2026-08-26). A DISTURBANCE THAT OPENS A REAL ATTACK PATH IS ITSELF
  AN ATTACK.** If a gate contains a LIVE attack, that attack must be non-destructive **in the
  disturbed state** - a throwaway target, a `BEGIN … ROLLBACK`, or an assertion about the
  PERMISSION rather than an actual execution. The owner's phrasing, kept: *«اختلالی که یک مسیر
  حملهٔ واقعی را باز می‌کند، خودش یک حمله است.»*
  What happened: the OG-61 gate aimed its live attack at a REAL admin (`order by user_id limit
  1`) and asserted the call was refused. The forced disturbance exists precisely to REMOVE that
  refusal - so when the anon grant was restored to prove the gate catches it, the gate's own
  call went through and **stripped the admin role from `ADMIN_USER_ID`, the harness account the
  whole suite runs as.** Admin rows 14 -> 13. Restored 54 seconds later, but the full run in
  flight had reached test 346 and was invalidated.
  **The generalisation: a gate proving a destructive action is REFUSED must never aim at a
  target whose loss would matter.** The refusal is the assertion; the target only has to be
  SHAPED right. Both halves now use a non-existent uuid, and the re-run confirms the gate still
  fails on a re-grant while admin rows stay at 14.
- **When you damage something, prove the BLAST RADIUS, not just the headline number.**
  Restoring the admin count to 14 does not show that nothing else changed. `audit_logs` did:
  exactly two role events in the window - `role_revoked` then `role_assigned`, same user, 54
  seconds apart. That evidence is only usable because the restore, done as a DIRECT SQL insert
  rather than through the RPC, was **itself audited** - which proves the audit covers direct
  table writes and is therefore a complete record of role changes, not a partial one. Check
  whether your evidence source would have SEEN the thing you are claiming did not happen.

### From mission 12-14 - process hygiene

- **RULE 7 (owner-directed 2026-08-26). A PROCESS IS NOT AN ORPHAN BECAUSE OF ITS NAME OR ITS
  COUNT. The only test is whether its PARENT IS ALIVE. Check the parent before any kill.**
  Four `chrome-headless-shell` processes were reported as returned orphans and queued for
  killing. They were not orphans: `Get-CimInstance Win32_Process` showed one whose parent was
  the live `node` running the suite, and three that were its own children, all created in the
  same second. **Killing them would have broken a suite at test 257 of 606** - roughly twenty
  minutes of work, and a baseline comparison lost. The owner's phrasing, kept: *«یتیم بودن یک
  فرایند از روی نام یا تعدادش معلوم نمی‌شود - تنها معیار این است که والدش زنده است یا مرده.»*
  This is **OG-54's lesson from the opposite direction**: there, a run that had completed was
  trusted and was worthless; here, processes that looked like debris were load-bearing. In both
  cases the name and the count were the misleading signal, and the structural relationship -
  what reconciles, what parents what - was the true one. `ParentProcessId` resolving to a dead
  pid is the evidence; anything else is a guess.

### From mission 14 step zero - Phase 7 measured

- **RULE 5 has a database form, and it is the most dangerous one yet: AN `UPDATE` THAT MATCHES
  NO RLS POLICY DOES NOT RAISE - IT AFFECTS ZERO ROWS AND REPORTS SUCCESS.** The receipt OCR
  write-back had no permissive UPDATE policy, so every extraction was discarded while the
  client saw `error: null` and then wrote an audit row saying it had completed. Five such audit
  rows exist for extractions that never landed. **`error === null` from a PostgREST write is
  not evidence the write happened** - assert the row count, or read the row back. This is the
  same family as "Successfully copied", "a completed run" and "a healthy container": a success
  signal from a layer that structurally cannot observe the failure.
- **A RESTRICTIVE policy is not a policy that grants.** `viewer_restricted` has `polcmd='*'`,
  which reads like it covers every command - and it does, but only to NARROW. With no
  permissive UPDATE policy alongside it, UPDATE was denied for everyone. When auditing RLS,
  read `polpermissive` before concluding a command is covered; the command letter alone is
  half the answer.
- **When three sources disagree, the running code is the only witness.** `requirements.md`
  said Tesseract, the function's own header comment said Lovable AI Gateway, the owner said
  qwen3.6 - and the truth was that the engine is a database row. Two of those three documents
  were stale, and both would have sent a reader looking for something that does not exist.
- **A document that PREDICTED a bug is worth re-reading, not just the code.**
  `docs/ocr/requirements.md` stated in its own Pipeline section that a write-back to
  `payment_receipt_documents` would be "silently a no-op" - correct, specific, and acted on by
  nobody for weeks. Before building what a requirements doc asks for, read what it WARNS about.
- **Health tables answer questions logs cannot.** `ai_provider_health` established that the
  cloud vision route was attempted as recently as 2026-08-19 and rejected with 401 - which is
  what turned "the route points at the cloud" from a configuration observation into a
  measured fact about where a banking image actually went.

### From mission 13 - OG-64, the CURRENT_DATE class

- **RULE 6 (promoted - third strike). AN AUDIT'S BLIND SPOT IS THE SHAPE OF ITS QUERY, AND IT
  NEVER APPEARS IN ITS OWN OUTPUT.** The OG-64 audit enumerated `pg_proc` and reported "21
  functions". That is the right query for functions and the wrong query for the CLASS: a full
  catalogue sweep found **2 views, 7 column defaults, 4 RLS policies and 2 check constraints**
  carrying the same comparison, none of them in `pg_proc`. The count read as complete because
  nothing in the result said "functions only". Third strike of this shape: OG-62's "47
  functions returned rows" (row COUNT, not value, so 47 was really 28); OG-38's "the role
  exists and can log in" (catalogue, not usage, so it looked live and had zero consumers); and
  now this. **Before trusting an enumeration, ask what KINDS of object could hold the thing
  being counted, and confirm the query reaches all of them.** Write the sweep into the
  research doc so the next mission re-runs it instead of re-deriving it.
- **A fix scoped to what was NAMED can be a no-op that reads as a success.** Mission 13 was
  scoped to five functions. Converting exactly those five would have produced (a) a payables
  row that contradicts itself on screen - listed under «امروز» by the fixed filter while the
  same row reports `days_until_due = 1` from the unfixed view - and (b) a staff-metric write
  that clears the function's guard and then dies on an RLS policy carrying the SAME
  `CURRENT_DATE`, swapping a clean Persian message for a row-level-security violation. **The
  scoped fix would have been strictly worse than the bug.** Before converting a guard, ask
  what ELSE enforces the same rule; the function is often not the gate.
- **A gate that is only true at some hours is not a gate.** The first assertion reconstructed
  the broken window with one fixed offset (`Etc/GMT+12`) and FAILED at 18:30 Tehran, because
  at that hour the offset's date happened to match Tehran's. Replaced with a claim that holds
  at every hour: UTC-12 and UTC+14 are 26 hours apart, and 26 > 24, so their dates ALWAYS
  differ. **Assert the PROPERTY, not one instance of it.**
- **A control that measures nothing will report "no bug found".** The first control ran
  without a JWT claim; the views are RLS-filtered to EMPTY without one, so it compared 0
  against 0 and concluded the bug was unreproducible on this data. The same query with the
  claim showed **349,800 against 13,000,000,024.95**. A negative result from an instrument you
  have not shown to be live is not a negative result.
- **`set_config` in a scalar SUBQUERY does not reliably run first.** PostgreSQL may evaluate
  it after the aggregate has already read the table. It must be a separate statement - which
  works through `psql -c`, because multiple statements there run in ONE transaction.
- **Quantify the consequence, then rank by it.** The 16 remaining functions were "located, not
  assessed", and assessing them changed the picture completely: four WRITE a wrong date into a
  record that cannot be corrected afterwards (`post_mutual_settlement` feeds
  `journal_entries.entry_date`, which the immutability trigger then locks), while two are
  wrong only on the first of a month. A flat count of 16 hides both facts.

### From mission 12 - gate clean-up (OG-56/57/68/69/70, OG-38)

- **RULE 5 (promoted - third strike, owner-directed 2026-08-26). A success signal from the
  LAYER YOU ASKED is not evidence that the THING YOU WANTED happened.** Three members of one
  family now, each of which cost real time:
  1. **"Successfully copied"** - `docker cp` printed it three separate times while the file
     never arrived in the container (OG-68).
  2. **"a completed run"** - the suite exited normally reporting 375/59/27, and ~137 tests
     had silently never run (OG-54).
  3. **"a healthy container"** - Docker reported `afrakala-lan-web` **healthy** while the app
     was unreachable from the host (`/login` 000), because the healthcheck runs INSIDE the
     container and cannot see the host port-forward. The owner's phrasing, kept verbatim:
     **«کانتینر سالم یعنی اپ در دسترس نیست»** - *a healthy container does not mean a reachable
     app.* `docker restart afrakala-lan-web` restored the forward (`200 in 0.078s`).
  The rule: **verify at the layer that MATTERS, from the side that CONSUMES it.** Delivery is
  proven container-side (`ls`/md5), not by an exit code. A run is proven by reconciling
  passed+failed+skipped against the total, not by the summary line. Reachability is proven
  from the HOST (`curl http://192.168.170.8:3100/login`), not by a healthcheck that lives
  inside the thing being tested. Every one of these three reported success from a layer that
  structurally could not observe the failure.
- **Fix what the remedy STARTED, not just what it named.** The owner's OG-56 remedy - exclude
  the two undeletable rows by id - was correctly applied and stopped the teardown crashing,
  so the row read as handled. It was not: the rows were still being COUNTED by 5.2/5 and still
  displacing `rows[0]` in `export-journal:162`. A remedy applied at one site does not
  propagate to every site the same fact reaches; re-run the specs before believing it closed.
- **Exclude by ID, never by marker.** The same exclusion written as `description not like
  'E2E_AUDIT_%'` would have passed today and hidden a genuine future leak behind the identical
  clause. Two ids can only ever forgive two rows.
- **Select a fixture by its PROPERTY, not by its position.** `rows[0]` meant "the corrupted
  entry" and stopped being that the moment anything else shared the export. `rows.find(r => description contains '?')`
  is what the assertion always meant, and it no longer depends on how many rows exist.
- **A measurement that finds nothing is still a result - report the probe you made yourself.**
  OG-38's window logged 7,849 authorized connections and exactly ONE for
  `supabase_read_only_user`; that one was this agent's own verification probe, flagged when it
  was made. Excluding it silently would have been indistinguishable from fabricating a clean
  reading. Say which observations are yours.
- **State what a window can and cannot establish.** 48 hours of zero consumers shows nothing
  observably depends on the role; it cannot show nothing depends on it *ever* - a monthly job
  would not appear. The owner's decision (keep the window open, do not `NOLOGIN` yet, revisit
  at Phase 9) follows from that distinction, so the distinction belongs in the row.

### From mission 11 - OG-66 + baseline settlement

- **A shared error signature is a hypothesis; the error TEXT is the diagnosis.** Seven
  failures were characterised as "data drift" by signature and left there. Read individually
  they had ONE head - a teardown dying on an FK - and fixing that one teardown closed all
  seven. Grouping by signature felt like diagnosis and was not.
- **A failing teardown is not a local problem.** It leaves its whole fixture behind, and the
  residue moves OTHER specs' baselines - here, two specs that capture a register's
  high-water mark then assert `max+1` got a number lower than the mark they had just read.
  When several unrelated specs fail on state, suspect a teardown before suspecting the code.
- **Scope a cleanup predicate to the ids the test itself created.** The tempting fix was to
  delete by marker or name; that would delete another spec's data, or the owner's. Bounded to
  its own created ids, the fix cannot reach anything it did not make.
- **An escaped disturbance is not automatically a gate failure.** D1 made the RPC ignore its
  limit and the gate did not catch it - correctly, because a unique name still returns 1 and
  an ambiguous one still returns >1, so the contract under test is unbroken. Adding an
  assertion to "catch" it would have pinned an implementation detail the caller does not
  depend on. Record the reasoning and leave it escaped.
- **State a gate's ceiling in the gate.** `lookup.ts` imports the browser client and cannot
  be tested from Node. The spec says that in its header instead of implying UI coverage it
  does not have - a reader who assumes coverage that is absent is worse off than one told
  where it stops.
- **Running the documented command can be the outage.** `up -d web` is what CLAUDE.md said to
  do, and it took the app down through a dependency chain nobody had traced. After changing
  anything about the environment, re-read the documented procedures for assumptions the
  change has invalidated - and fix the DOCUMENT, not just the gate log.

### From mission 10 - OG-65
- **A suite that runs to completion can still be worthless, and the summary line will not say
  so.** This run reported "375 passed / 59 failed / 27 skipped" and exited normally. The
  arithmetic is what exposed it: 375+59+27 = 461 of 598, and an independent count found 164
  `-` markers rather than 27. The missing ~137 were tests taken out when a shared `beforeAll`
  died. **Always reconcile passed+failed+skipped against the total**, exactly as A4.21 says to
  cross-check the summary against an independent count - the same discipline, applied to the
  skip column instead of the failure column.
- **When many specs fail at once, read the ERROR before the failing set.** The failing set
  looked like a broad regression across the asan and persons families. The error was
  `docker cp ... mkdir /run/desktop/mnt/host/d: file exists` - an infrastructure fault in the
  fixture writer, with nothing to do with the code under test. A set comparison would have
  produced a confident, entirely wrong story.
- **Deploying can break the harness, not just the app.** `docker compose up -d web` is the
  documented deploy step and it is the most plausible trigger for Docker Desktop re-evaluating
  its mounts. After any deploy, prove the harness's own plumbing still works - one
  `docker cp` probe - BEFORE spending 16-25 minutes on a suite.


- **RULE 3 (promoted - third-strike, owner-directed 2026-08-26). A test that asserts a wrong
  value PROTECTS the bug, and "built but wrong / built but unwired" is now the expected shape
  on this project.** Two e2e specs asserted `Name_Moshtari`/`Shomare_Peygiri`, one commenting
  that the transliteration was "reproduced **exactly**". They did not merely fail to catch the
  wrong headers - they made the correct fix look like a regression, which is why it shipped
  that way. Counting the pattern from this log: `/purchase` built and in no menu; the Asan
  templates built and matching the spec already (#356); party search built and wired but the
  ledger wizard using a narrower path (#357); and now the bank headers built, asserted, and
  wrong. **Fourth occurrence, so it is a rule:**
  1. When a spec and an external artefact disagree, **the artefact is the authority and the
     spec is a claim.** Measure the artefact before changing either.
  2. A green test proves the code matches the test, never that the test matches reality. For
     anything crossing a system boundary - a file another program imports, a header, a wire
     format - the assertion's SOURCE must be recorded next to it, so the next reader can tell
     a measurement from a guess.
  3. Start every mission by asking *what does this already do*, not *what must I build*.
     Three consecutive missions have been briefed as builds and measured as questions.
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
- **RULE 4 (promoted - owner-directed 2026-08-26). Every machine-load measurement must be
  DISTRIBUTIONAL, never a single sample.** This mission held the suite on an idle-CPU reading
  of 37.7%; the owner re-measured the same machine as **mean 18.71% / median 18.62%**, and the
  high figure was a transient ~2.5 sigma above the mean. Single samples misled the diagnosis
  **three separate times** in this one episode: a 49% spike, a 40.5% reading for one
  container, and a container total that swung between 0.73% and 19%. So:
  1. Report **mean AND median over a window**, never one reading, and never the max.
  2. A spiky maximum is not a threshold breach; the median is the honest summary of idle load.
  3. Apply the same rule to per-process and per-container attribution - a one-shot `top`
     equivalent will finger whichever process happened to be scheduled.
  Corollary that still stands: the other two A4.18 criteria passed here, `/login` at 0.18s
  included. **Responsiveness can look fine while the machine is loaded** - that is how the
  4.7-hour invalid run (OG-54) happened - so do not substitute a latency probe for the CPU
  distribution either.

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
