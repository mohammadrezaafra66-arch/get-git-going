═══════════════════════════════════════════════════════════════════════════════
EXECUTION PLAN — P1 SECURITY + ALL D8-UNBLOCKED PHASES
AfraKala · Fully automated · Tests at every checkpoint · e2e gate at the end
═══════════════════════════════════════════════════════════════════════════════

SOURCE OF TRUTH FOR THIS WORK:
  docs/research/audit-220-226.md   (the 2,837-line audit — read section D8 and D9)
  docs/execution/p0-quick-wins.md  (P0, already shipped as 6ab05d6e)
  PROGRESS.md                      (decision history — read it FIRST)

STATE AT START:
  Branch:        feature/navigation-modernization
  HEAD:          74097b1c  (working tree committed; APP_GIT_SHA now matches HEAD)
  Last migration: 263
  typecheck baseline: exactly 70 errors — never exceed
  e2e baseline:  121 green / 3 red (the 3 reds are pre-existing; do not "fix" them
                 by weakening assertions — confirm they are the same 3)
  P0: shipped and live
  P1: NOT started — this document starts with it

═══════════════════════════════════════════════════════════════════════════════
OWNER DECISIONS (D8) — RESOLVED. THESE ARE BINDING REQUIREMENTS.
═══════════════════════════════════════════════════════════════════════════════

D8-1 — Capital ceiling override: LOCKED AT BOTH LEVELS.
  Neither the daily total capital nor the per-salesperson ceiling may be edited
  by hand once the system has computed it. daily_capital_snapshots currently has
  system_suggested_capital / final_capital / override_reason — the override path
  must be closed, not merely discouraged. The accountant still SETS the day's
  capital as an input; what is forbidden is overriding the computed result.
  (Owner answered: ب — both locked.)

D8-2 — One person = one external party. external_parties.person_id becomes UNIQUE.
  Duplicates must be merged or corrected before the constraint can be added.
  (Owner answered: الف.)

D8-3 — Employees join the person model, INCREMENTALLY.
  Add profiles.person_id (or the equivalent staff link) and backfill it. Do NOT
  move or repoint any existing column or key. No employee_* table is restructured
  in this phase. This is the minimum that makes "one person, several roles" real.
  (Owner answered: الف.)

D8-4 — Score level thresholds, four bands of 20:
      80–100  عالی
      60–79   قابل اعتماد
      40–59   متوسط
      0–39    پرریسک
  Thresholds live in a VERSIONED table with valid_from / valid_to, exactly like
  dynamic_parameter_weights — never hard-coded, and changing them must not rewrite
  a historical level.
  (Owner adjusted the proposal: پرریسک below 40, and the freed 10 points
  redistributed upward — giving four equal 20-point bands.)

D8-5 — Manual negative scores: the MANAGER sets the duration at the moment of
  recording, and the manager must SEE the effect before confirming.
  Two hard requirements:
    (a) The manual-score form has a duration field (e.g. "how many months does
        this affect the score?"), chosen per entry. There is no global rule.
    (b) Before submit, the form shows a PREVIEW: this person's current score,
        the score after this entry lands, and the per-month effect over the
        chosen duration. The manager confirms a number they have actually seen.
  Decay shape within the duration is a design choice — pick one, state it in the
  UI in Persian, and make it explainable in the score breakdown.
  (Owner answered: duration decided by manager at entry time + effect must be
  shown to the manager.)

D8-6 — Excel export: TWO modes. Keep the existing human-readable export exactly
  as it is, and add a separate "خروجی آسان" mode alongside it.
  ⚠️ BLOCKED: the real Asan sample file has not been provided. Do NOT guess the
  column layout. Implement the mode-selection plumbing and a clearly-marked
  placeholder adapter, then STOP and report that the sample is required.
  (Owner answered: الف — separate mode.)

D8-7 — HTTPS: the owner CAN provide an internal domain and certificate.
  PWA is therefore in scope. Build it, but make the HTTPS prerequisite explicit
  and testable: the manifest, icons, and service worker ship regardless, and the
  install prompt appears once the app is served over HTTPS.
  (Owner answered: الف.)

D8-8 — Warehouse selection moves to LINE level.
  A single proforma may draw lines from different warehouses. This touches
  sales_quote_items and purchase_items and the stock-check logic at finalisation.
  The existing rule must survive: a proforma may be created with insufficient
  stock, but the accountant must not finalise more than actual stock — and that
  check now runs PER LINE against PER-WAREHOUSE stock.
  (Owner answered: الف — line level.)

═══════════════════════════════════════════════════════════════════════════════
ABSOLUTE OPERATING RULES
═══════════════════════════════════════════════════════════════════════════════

- auto-accept is ON. Work through every phase without asking permission.
  EXCEPTION: stop and report at a failed HARD GATE (defined per phase). Never
  force past a gate.
- Terminal output English (LANG=en_US.UTF-8). Persian UI strings stay Persian.
- SQL containing Persian text: docker cp + psql -f. NEVER pipe it in PowerShell.
- Before rebuilding ANY function or trigger: pg_get_functiondef first, save the
  snapshot under docs/verification/pre-<migration>/, diff after, report the diff.
- Every migration: --single-transaction + ON_ERROR_STOP, dry-run inside a
  ROLLBACK transaction FIRST, and a matching XXX-down.sql in docs/verification/
  (deliberately NOT inside supabase/migrations/).
- Migrations continue from 264 upward. Follow the existing filename convention
  (2026MMDD<HHmmss>_<n>_<slug>.sql), UTF-8 without BOM.
- Never touch production 192.168.170.10. All DB work targets afrakala-lan-db.
- pg_dump backup before any phase that adds a constraint, drops anything, or
  rewrites a money-touching function. Record the sha256.
- DEPLOY — the only reliable command on this stack:
      $env:GIT_SHA = (git rev-parse --short HEAD)
      $env:BUILD_TIME = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
      docker compose --env-file deploy/lan/.env.lan `
        -f deploy/lan/docker-compose.yml up -d --build web
  Verify with BOTH signals — APP_BUILD_TIME freshness AND a grep for a symbol
  introduced in this run. APP_GIT_SHA now matches HEAD again; keep it that way
  by capturing GIT_SHA AFTER the commit, not before.
  ⚠️ Remember: docker-compose.yml:30 uses `context: ../..`, so the image is built
  from the WORKING TREE, not from a git ref. Commit before you build, or the
  label will lie again.
- Commit at the end of each phase. Record real SHAs and row counts in PROGRESS.md.
- No test script exists in package.json — e2e runs via `npx playwright test`.

CONTEXT MANAGEMENT: this is a long mission. Before context runs out, append a
`## HANDOFF STATE` block to docs/execution/p1-d8-progress.md containing:
COMPLETED phases · INCOMPLETE phases in order · migrations applied · commit SHAs ·
open contradictions · NEXT STEP. Replace any previous HANDOFF STATE block. On
resume, read PROGRESS.md and that file and continue from the first incomplete
phase — never redo finished work.

═══════════════════════════════════════════════════════════════════════════════
PHASE 0 — Baseline verification (read-only)
═══════════════════════════════════════════════════════════════════════════════

1. Read PROGRESS.md, CLAUDE.md, AGENTS.md, and docs/research/audit-220-226.md
   (at minimum sections D3, D6, D8, D9).
2. Confirm the starting state:
     git rev-parse --short HEAD                  → 74097b1c (or later)
     git status --porcelain                      → note anything modified
     docker exec afrakala-lan-web printenv APP_GIT_SHA   → should match HEAD
     npx tsc --noEmit 2>&1 | grep -cE "error TS" → 70
     npm run build                                → pass
     npx playwright test --reporter=list          → record green/red counts
3. Create docs/execution/p1-d8-progress.md with a header and an empty
   HANDOFF STATE block. This file is the running log for the whole mission.
4. Report the baseline table, then continue automatically to Phase 1.

═══════════════════════════════════════════════════════════════════════════════
PHASE 1 — P1 SECURITY (four holes, no D8 dependency)
═══════════════════════════════════════════════════════════════════════════════

This phase is first because item 1.1 is the only risk the audit rated CRITICAL
and currently ACTIVE.

── 1.1 — Ownership-aware RLS on persons / person_identifiers ─────────────────

THE HOLE: every salesperson can currently read the mobile, email, national ID
and IBAN of EVERY customer — the RLS on persons/person_identifiers does not
mirror the ownership restriction that customers already enforces. UI hiding is
not enforcement; the database still returns the rows.

REQUIRED BEHAVIOUR (from audit decision 17):
  - admin, manager, accountant  → all persons
  - salesperson                 → only persons linked to customers assigned to them
  - a person's own record       → always readable by that person
  - purchase_specialist         → persons linked to suppliers/parties they work
                                  with (confirm the exact rule from the existing
                                  supplier ownership model; do not invent one)

IMPLEMENTATION NOTES:
  - Read the existing customers RLS policy FIRST and mirror its ownership shape.
    Do not invent a second ownership mechanism.
  - Use person_context_links to reach from a person to the customer/supplier that
    determines ownership.
  - Watch performance: an ownership subquery on every persons SELECT can be
    expensive. Check the query plan and add an index if the plan shows a seq scan.

HARD GATE — the acceptance test MUST run through a direct PostgREST call using a
salesperson JWT, NOT through the UI. The whole point of this fix is that the UI
already hides what the database still returns. A UI-only test proves nothing.

  Test shape:
    1. Pick a salesperson and a customer NOT assigned to them.
    2. Call PostgREST /rest/v1/persons and /rest/v1/person_identifiers with that
       salesperson's JWT, filtering for the unowned person.
    3. BEFORE the fix: rows come back (record this — it is the evidence).
    4. AFTER the fix: zero rows.
    5. Also assert the salesperson STILL sees their own customers' persons
       (a fix that blinds them entirely is a different bug).

── 1.2 — Remove the same-month weight UPDATE branch ──────────────────────────

THE HOLE: changing a criterion weight inside the current month runs
`IF v_cur_valid_from = v_month THEN UPDATE`, which irreversibly rewrites that
month's score and immediately re-runs capital allocation. This violates D8-4's
requirement that changing weights must not alter historical scores — and the
"current month" is history the moment anything has been computed from it.

REQUIRED BEHAVIOUR: a weight change always creates a NEW version with a
valid_from in the future (or at the next period boundary), never an UPDATE of
the live row. The current month's already-computed scores stay as they are.

  - Snapshot the function with pg_get_functiondef before touching it.
  - Report exactly what the UPDATE branch did and what replaces it.
  - If a manager genuinely needs to correct a mistyped weight the same day, that
    is a CORRECTION EVENT, not an in-place edit — implement it as a new version
    plus an audit row explaining why, and say so in the report.

HARD GATE: after the change, set a weight twice in one month and assert:
  - two versions exist
  - the first month's computed score is byte-identical to what it was before
  - capital allocation did NOT silently re-run

── 1.3 — Size and MIME limits on payment-receipt-documents ───────────────────

THE HOLE: this is the only bucket in the project where BOTH file_size_limit and
allowed_mime_types are NULL. Any file, any size, any type.

  - Read what the payment-receipt upload UI actually promises and mirror it,
    exactly as migration 263 did for delivery-receipts.
  - Keep the bucket private (do not include `public` in a DO UPDATE).
  - Align the UI's accept string, its validation list, and the bucket so all
    three agree — the 263 lesson.

── 1.4 — Make /api/healthz real ──────────────────────────────────────────────

THE HOLE: it returns a constant {ok:true}, so Docker's healthcheck stays green
during a database or AfraPayam outage.

REQUIRED: check what the container actually depends on:
  - a cheap database round trip (SELECT 1, short timeout)
  - optionally the AfraPayam bridge, reported as a DEGRADED sub-status rather
    than failing the whole health check (an AfraPayam outage should not restart
    the web container)
  - return a non-200 only for conditions that genuinely mean "do not send me
    traffic"
  - keep it fast; healthchecks run often

TESTS FOR PHASE 1:
  - 1.1 PostgREST-level test above (before/after evidence) — HARD GATE
  - 1.2 double-weight-change test — HARD GATE
  - 1.3 upload an oversized file and a disallowed type → both rejected; a valid
        receipt still uploads
  - 1.4 stop the DB container briefly (LAN only) and confirm healthz goes
        unhealthy, then recovers. If stopping the DB is too disruptive, simulate
        by pointing the check at an unreachable host in a test build and say so.
  - npx tsc --noEmit → 70 · eslint on touched files → 0 errors · npm run build → pass
  - person_fk_drift_report() → empty

Migrations: 264 (RLS), 265 (weight versioning), 266 (bucket limits) — adjust
numbering to whatever is actually next; ship a down script for each.
Commit: "Phase 1: P1 security — RLS ownership, weight versioning, bucket limits, real healthz"

═══════════════════════════════════════════════════════════════════════════════
PHASE 2 — D8-1: Lock the capital ceiling override
═══════════════════════════════════════════════════════════════════════════════

Owner decision: BOTH levels locked. The system-computed result is final.

  1. Read daily_capital_snapshots and every write path into
     system_suggested_capital / final_capital / override_reason.
  2. Distinguish clearly, and say so in the report:
       INPUT  — the accountant declaring how much capital exists today.
                This stays editable. It is a business fact, not a formula output.
       OUTPUT — the computed per-salesperson ceiling and the final capital
                figure derived from it. These become read-only.
  3. Close the override path at the DATABASE level, not just the UI: a trigger or
     a policy that rejects a manual write to the computed columns, with a clear
     Persian error. UI-only locking repeats the 1.1 mistake.
  4. Keep override_reason and any historical override rows — do not delete
     history. Mark the column deprecated with a comment stating the date and the
     decision that closed it.

HARD GATE: attempt a direct UPDATE on final_capital via psql as the app role →
must be rejected. Attempt to set the day's total capital as an accountant →
must still succeed.

Also verify: the existing 182 allocation rows and their snapshots are unchanged
(count and a checksum of the computed values before/after).

Commit: "Phase 2: capital ceiling is system-computed and no longer overridable (D8-1)"

═══════════════════════════════════════════════════════════════════════════════
PHASE 3 — D8-2: external_parties.person_id becomes UNIQUE
═══════════════════════════════════════════════════════════════════════════════

Owner decision: one person = one external party.

  1. Find duplicates first:
       SELECT person_id, COUNT(*), array_agg(id)
       FROM public.external_parties
       WHERE person_id IS NOT NULL
       GROUP BY person_id HAVING COUNT(*) > 1;
     Report every duplicate with both parties' names and what references them.
  2. For each duplicate, classify and report BEFORE acting:
       - genuinely the same party recorded twice → consolidate, repointing all
         references to the survivor (reuse the person_merge machinery's approach;
         do not write a second merge implementation)
       - genuinely two different parties that were wrongly linked to one person →
         fix the link, do not merge
     If any case is ambiguous, STOP and report it rather than choosing.
  3. Then add the UNIQUE constraint (partial on active rows if external_parties
     has a soft-delete or is_active column — check the real schema and justify
     the choice).
  4. Update the external-party creation path so a second party for an existing
     person is either refused with a clear Persian message or reuses the existing
     row — mirroring what Phase 8.3 did for customers/suppliers.

HARD GATE: zero duplicates before the constraint; a deliberate duplicate insert
after → rejected with the expected error code.

Commit: "Phase 3: one person = one external party (D8-2)"

═══════════════════════════════════════════════════════════════════════════════
PHASE 4 — D8-3: Employees join the person model (incremental)
═══════════════════════════════════════════════════════════════════════════════

Owner decision: yes, but ADDITIVE ONLY. No existing column or key moves.

  1. Read the employee side properly first: profiles, employee_*, and how a user
     account currently relates to an employee. Report the real shape before
     changing anything — the audit named ~12 tables that touch employee data.
  2. Add profiles.person_id (nullable at first) with an FK to persons.
  3. Backfill: for each profile, find or create the matching person.
       - Match on normalised mobile / national ID using the SAME identity-matching
         logic person_import_batch uses. Do not write a second matcher.
       - With the global mobile uniqueness rule from Phase 8.4 in force, matching
         must LINK when the number already exists rather than create a duplicate.
       - Report the linked-vs-created split.
  4. Create person_context_links rows with the employee context so the person
     record shows the staff relationship.
  5. Do NOT set NOT NULL in this phase, and do NOT repoint any existing FK.
     State explicitly in the report what a future phase would need to do to
     make it mandatory.

HARD GATE: every profile has a person_id after backfill (report the count), and
no existing employee-related query changed behaviour — run the employee-facing
e2e specs and confirm they are unchanged.

Commit: "Phase 4: employees linked to the person model, additive (D8-3)"

═══════════════════════════════════════════════════════════════════════════════
PHASE 5 — D8-4: Versioned score-level thresholds
═══════════════════════════════════════════════════════════════════════════════

Owner decision — four equal bands:
      80–100  عالی
      60–79   قابل اعتماد
      40–59   متوسط
      0–39    پرریسک

  1. Create a versioned thresholds table modelled EXACTLY on
     dynamic_parameter_weights (valid_from / valid_to, is_active, audit columns).
     Read that table's definition first and mirror it — same shape, same
     versioning discipline, same admin-editability.
  2. Seed the four bands above with a valid_from of the current period.
  3. calculate_dynamic_score (or whichever function produces the number) gains a
     level lookup that resolves against the version in force AT THE SCORE'S
     PERIOD, not the version in force today. Changing the bands next year must
     not relabel last year's scores.
  4. Surface the level in the UI next to the number, in Persian, wherever the
     score is shown. Include it in the score breakdown/explanation.
  5. The level must be derivable historically: a score from three months ago,
     displayed today, shows the label it had then.

HARD GATE: numeric parity — the underlying score numbers must not change at all.
Sample at least 8 real people across the bands, capture before/after, assert
identical. This phase adds a label; it does not touch the maths.

Commit: "Phase 5: versioned score-level thresholds, four bands (D8-4)"

═══════════════════════════════════════════════════════════════════════════════
PHASE 6 — D8-5: Manual score with manager-chosen duration and a live preview
═══════════════════════════════════════════════════════════════════════════════

Owner decision, two parts, both mandatory:
  (a) the manager chooses the duration AT THE MOMENT of recording
  (b) the manager SEES the effect before confirming

  1. Extend the manual-score record with:
       - effect_months (chosen per entry — no global default rule)
       - a decay shape (pick one, apply consistently, name it in the UI in
         Persian; e.g. full weight then linear decay, or flat for the duration)
       - the existing mandatory fields: description, recorder, timestamp
       (audit decisions 14 and 15 still hold: no attachment required, and the
        RECORD never expires even though its numeric EFFECT does)
  2. Build the preview. Before submit the form must show:
       - the person's current score and level
       - the score and level immediately after this entry lands
       - the per-month effect across the chosen duration (a small table or
         sparkline is enough — the manager must see the shape, not a promise)
     Compute the preview from the SAME function that computes the real score.
     A preview that uses a separate formula is worse than no preview.
  3. The score breakdown must explain the entry afterwards: how much of today's
     score comes from this manual entry, and how many months remain.
  4. Existing manual scores: decide and REPORT what happens to entries recorded
     before effect_months existed. Recommended: give them a default duration,
     record that they were migrated, and do not silently change anyone's current
     score — if the default would change a live score, state by how much and for
     whom before applying.

HARD GATE: record a manual −N on a test person and assert the preview number
equals the real post-submit score exactly. If they differ by any amount, the
preview is lying — fix it before continuing.

Commit: "Phase 6: manual scores carry a manager-chosen duration and a verified preview (D8-5)"

═══════════════════════════════════════════════════════════════════════════════
PHASE 7 — D8-8: Warehouse selection at LINE level
═══════════════════════════════════════════════════════════════════════════════

Owner decision: each proforma/purchase line carries its own warehouse.
This is the largest phase. Take it in strict order.

BACKUP FIRST: pg_dump → D:\backups\afrakala\pre_phase7_line_warehouse_<ts>.sql.gz

  7.1 — Schema
    - Add warehouse_id to sales_quote_items and purchase_items (FK, nullable at
      first), plus an index if the stock query needs one.
    - Backfill from the document-level warehouse so every existing line keeps
      its current meaning exactly.
    - Verify zero lines left without a warehouse where the document had one.
    - Keep the document-level column for now (dual-column during transition,
      the pattern used throughout Phases 5–7 of the person work).

  7.2 — Stock logic
    - The existing rule must survive intact: a proforma MAY be created with
      insufficient stock; the accountant MUST NOT finalise more than actual stock.
    - That check now runs PER LINE against PER-WAREHOUSE stock, not against a
      single document warehouse.
    - Find every place that reads the document-level warehouse for a stock
      decision (RPC, trigger, service, UI) and report the list before changing it.
    - Snapshot and diff every function you touch.

  7.3 — UI
    - Line-level warehouse selector in the proforma and purchase forms, defaulting
      to the document warehouse so the common single-warehouse case stays as fast
      as it is today. Changing a line's warehouse must be possible but must not
      be the default interaction cost.
    - Show per-warehouse availability next to the line when a warehouse is chosen.
    - Finalisation must clearly report WHICH line failed the stock check and in
      WHICH warehouse — a generic "insufficient stock" is not acceptable here.
    - Mobile-first and RTL, like every other form.

HARD GATE (three assertions, all required):
  1. An existing single-warehouse proforma behaves exactly as before — create,
     finalise, and stock movement identical to the pre-change behaviour.
  2. A proforma with two lines in two different warehouses can be created AND
     finalised when both warehouses have stock.
  3. The same proforma is REFUSED at finalisation when one line's warehouse is
     short — with an error naming that line and that warehouse.

Commit: "Phase 7: warehouse selection at line level (D8-8)"

═══════════════════════════════════════════════════════════════════════════════
PHASE 8 — D8-7: PWA (manifest, icons, service worker, camera)
═══════════════════════════════════════════════════════════════════════════════

Owner decision: HTTPS will be provided, so PWA is in scope.

⚠️ FIRST, THE BLOCKER THE AUDIT FOUND: src/lib/cache-buster.ts:65-84 actively
UNREGISTERS any service worker. That code exists for a reason — read it, find out
what problem it was solving, and report it BEFORE removing it. Replacing a
deliberate cache-buster with a service worker that serves stale builds would be
a straight regression, and stale-cache is listed in the audit's risk table.

  8.1 — Manifest and icons
    - Web app manifest with name, short_name, start_url, scope, display:
      standalone, theme colour, background colour, and a full icon set including
      maskable icons.
    - Persian name, RTL-appropriate.

  8.2 — Service worker with a SAFE update strategy
    - The update strategy is the whole design problem here, not an afterthought.
      Requirement: after a deploy, a user must NOT sit on the old build for long.
      Design for: fetch-then-cache for the shell, skipWaiting + clientsClaim with
      an explicit "نسخهٔ جدید در دسترس است" prompt, or an equivalent that you can
      defend. State the chosen strategy and why.
    - Offline operation is NOT required (owner decision 50). Do not build an
      offline data layer.
    - Reconcile with cache-buster.ts: either the service worker takes over its
      job properly, or the two are explicitly scoped so they cannot fight.

  8.3 — HTTPS readiness
    - Document exactly what the owner must provide: domain name, certificate,
      and where it plugs in (reverse proxy config, compose, ENV).
    - Make the app work correctly under both http (LAN today) and https (later).
      The service worker simply will not register over plain http — that is
      browser behaviour, not a bug. Handle it gracefully: no console errors, no
      broken install button, just no install prompt.
    - This also addresses audit item 220.2 (server move / IP change): recommend
      the domain-based setup so an IP change stops being a code change.

  8.4 — Camera, completing P0 item 4
    - P0 added CameraCaptureButton to four forms. The audit listed four gaps that
      were deliberately deferred: image compression, EXIF orientation, upload
      progress, and retry after a failed upload. Implement them now — a
      purchasing officer on a phone with a weak connection needs all four.

TESTS FOR PHASE 8:
  - Lighthouse PWA audit (or equivalent) run against the app; report the score
    and every failed criterion honestly, including the HTTPS one.
  - Manifest parses; icons resolve; no 404s.
  - Service worker registers over https and cleanly does nothing over http.
  - After a rebuild, a loaded client picks up the new version within the
    designed window — test this explicitly, it is the risk that matters.
  - Camera: this needs a REAL DEVICE and cannot be proven headless. Write the
    manual test steps and mark them as owner-verified rather than claiming a pass.

Commit: "Phase 8: PWA — manifest, icons, safe-update service worker, camera hardening (D8-7)"

═══════════════════════════════════════════════════════════════════════════════
PHASE 9 — Requirement 223: mandatory packaging for televisions
═══════════════════════════════════════════════════════════════════════════════

No D8 dependency. Binding requirement: every television-category product carries
a mandatory packaging instruction that a salesperson cannot remove.

  1. Identify the television category by a STABLE ID, not by matching the Persian
     name. If no stable identifier exists, report that first — a rule keyed on a
     text match is a bug waiting to happen and must not be the primary mechanism.
  2. Layer the enforcement so bypassing the UI cannot remove it:
       - when the product is added to the proforma line
       - server-side validation on save
       - creation of the packaging service requirement / task
       - visible on the printed document
       - warehouse preparation sees the task
       - finalisation checks it
  3. Displayed text: «این کالا حتماً باید بسته‌بندی شود.»
  4. The salesperson may ADD optional services but may not REMOVE this one; the
     backend must reject removal, not just grey out a checkbox.

NOTE ON SCOPE: the full per-line product-services model (audit B2.3, eight service
types) is a larger piece of work. This phase implements the television packaging
rule on the smallest correct foundation. If that foundation is the service model
itself, build the minimum of it — but do NOT build a parallel one-off mechanism
that a later services phase would have to unpick. Report which route you took
and why.

HARD GATE: add a television to a proforma → packaging requirement appears
automatically; attempt to remove it via the UI → refused; attempt to remove it
via a direct API call → refused by the backend.

Commit: "Phase 9: mandatory packaging for televisions, enforced in depth (223)"

═══════════════════════════════════════════════════════════════════════════════
PHASE 10 — Requirement 224: recurring marketing tasks
═══════════════════════════════════════════════════════════════════════════════

No D8 dependency. The audit found the pieces already exist:
  - `tasks` is a complete polymorphic task system with a KPI RPC — and 0 rows
  - `marketing_channels` exists with 56 rows and a daily_quota column, but drives
    product-promotion suggestions, not daily tasks
  - what is missing is a recurring-template table plus a daily generation job

Building a second task system is FORBIDDEN. Extend what exists.

  1. Recurring template table: channel, task description, assignee (person or
     group), active flag, which days it recurs.
  2. Daily generation job creating task instances from templates.
       - Timezone MUST be Asia/Tehran (the audit flagged Europe/Sofia as a trap).
       - Idempotent: running twice on the same day must not double up.
       - Locking so overlapping runs cannot both generate.
  3. Owner's binding rules (decisions 28–33):
       - tickable with no evidence required
       - no manager approval step
       - an unfinished task does NOT roll over to the next day — it expires as
         incomplete and is visible as such in reporting
       - completion feeds performance reporting and the person's profile
  4. Channels: Instagram, WhatsApp, Rubika, Bale, articles, and admin-definable
     others. Reuse marketing_channels rather than adding a second channel list —
     if its current shape does not fit, extend it and say why.
  5. Connect completion to the existing gamification/leaderboard rather than a
     new scoring path (audit decision 34).
  6. Mobile-first: this is ticked on a phone.

HARD GATE: run the generation job twice for the same day → exactly one set of
tasks. Complete one → it appears in that person's profile and the leaderboard.
Leave one incomplete overnight → it does NOT appear tomorrow as a new task.

Commit: "Phase 10: recurring marketing tasks on the existing task system (224)"

═══════════════════════════════════════════════════════════════════════════════
PHASE 11 — D8-6: Excel export mode plumbing (partially blocked)
═══════════════════════════════════════════════════════════════════════════════

Owner decision: two modes, existing export untouched.

  1. Add mode selection to the export UI: «خروجی معمولی» (current, unchanged)
     and «خروجی آسان» (new).
  2. Add the line-detail toggle the owner asked for (decisions 44–45): the user
     chooses whether product line detail appears in the export. Apply it to both
     modes and to the proforma and receipt/payment exports.
  3. Confirm the existing export is a real XLSX, not a CSV with an .xlsx name
     (the audit says it is real — verify rather than trust).
  4. ⚠️ STOP at the Asan column layout. The real sample file has NOT been
     provided. Implement the adapter interface and a clearly-marked placeholder
     that refuses to produce output, with a Persian message saying the format is
     not yet configured. Do NOT guess columns — a wrong layout that silently
     imports into the owner's accounting software is worse than no feature.
  5. Report clearly: "خروجی آسان needs the real sample file to be completed."

HARD GATE: the existing export is byte-comparable before and after for the same
input (the new mode must not perturb it).

Commit: "Phase 11: export mode selection and line-detail toggle; Asan layout awaiting sample (D8-6)"

═══════════════════════════════════════════════════════════════════════════════
PHASE 12 — Build, deploy, FULL e2e regression, final report
═══════════════════════════════════════════════════════════════════════════════

  1. BUILD
       npx tsc --noEmit                → exactly 70
       npx eslint <all touched files>  → 0 errors
       npm run build                   → pass

  2. COMMIT FIRST, THEN DEPLOY (so APP_GIT_SHA does not lie again)
       git add / commit any remaining work
       $env:GIT_SHA = (git rev-parse --short HEAD)
       $env:BUILD_TIME = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
       docker compose --env-file deploy/lan/.env.lan `
         -f deploy/lan/docker-compose.yml up -d --build web

  3. VERIFY DEPLOY — all three signals
       APP_GIT_SHA == git rev-parse --short HEAD
       APP_BUILD_TIME is fresh
       grep the container for a symbol introduced in this run
       docker ps → web Up (healthy), db-role-fix Exited (0), everything else Up

  4. DATABASE VERIFICATION — report every value
       - persons RLS: salesperson JWT cannot read an unowned customer's identifiers
       - final_capital: direct UPDATE rejected
       - external_parties.person_id: UNIQUE present, duplicates 0
       - profiles.person_id: backfilled count, 0 unmatched
       - score thresholds: 4 bands, versioned, historical labels stable
       - manual score: preview equals actual
       - line-level warehouse: 0 lines without a warehouse where the document had one
       - person_fk_drift_report() → empty
       - credit numbers unchanged from before this whole mission (sample of 8)

  5. FULL E2E REGRESSION — the gate for the entire mission
       npx playwright test --reporter=list
       Compare against the Phase 0 baseline. The 3 known reds may remain red —
       confirm they are THE SAME 3. Any new red is a regression and must be fixed
       before the mission is called complete.

       THEN write and run new specs for this mission. Discover real routes and
       DOM first — guessing selectors has wasted time before. Remember
       getByRole name matching is substring by default; use exact: true.

       a) e2e/security/persons-rls-ownership.spec.ts
          Direct PostgREST calls with a salesperson JWT. Unowned customer's
          person and identifiers → zero rows. Owned → still visible.
       b) e2e/scoring/threshold-levels.spec.ts
          A score in each band shows the right Persian label; a historical score
          keeps its original label after a threshold version change.
       c) e2e/scoring/manual-score-preview.spec.ts
          Preview number == post-submit score, exactly.
       d) e2e/capital/no-override.spec.ts
          The computed ceiling is read-only in the UI and rejected at the API.
       e) e2e/warehouse/line-level-warehouse.spec.ts
          Two-warehouse proforma: creates, finalises when stocked, is refused
          with a line-and-warehouse-specific message when short.
       f) e2e/marketing/recurring-tasks.spec.ts
          Job idempotency, completion reaching the profile, no rollover.
       g) e2e/products/tv-packaging-mandatory.spec.ts
          Auto-added, not removable via UI, not removable via API.

       Re-run everything; all new specs green, no new reds in the old suite.

  6. DATA HYGIENE
       Every data-creating spec cleans up in afterAll and asserts zero leftovers.
       Report row counts for persons / customers / suppliers / external_parties /
       profiles before and after the mission.

  7. FINAL REPORT — produce this, fully filled in:

  | Phase | Decision | Migration | Commit | Tests | Status |
  |---|---|---|---|---|---|
  | 1  | P1 security      | ? | ? | RLS gate, weight gate | ? |
  | 2  | D8-1 capital     | ? | ? | direct UPDATE rejected | ? |
  | 3  | D8-2 ext parties | ? | ? | duplicates 0, insert rejected | ? |
  | 4  | D8-3 employees   | ? | ? | backfill count | ? |
  | 5  | D8-4 thresholds  | ? | ? | numeric parity 8 people | ? |
  | 6  | D8-5 manual score| ? | ? | preview == actual | ? |
  | 7  | D8-8 warehouse   | ? | ? | 3 hard-gate assertions | ? |
  | 8  | D8-7 PWA         | ? | ? | Lighthouse, update strategy | ? |
  | 9  | 223 TV packaging | ? | ? | UI + API removal refused | ? |
  | 10 | 224 marketing    | ? | ? | idempotency, no rollover | ? |
  | 11 | D8-6 export      | ? | ? | existing export unchanged | ? |

  Answer directly:
    - Did any credit or score NUMBER change anywhere? (must be NO)
    - Can a salesperson still read an unowned customer's identifiers? (must be NO)
    - Is APP_GIT_SHA == HEAD? (must be YES)
    - Which phases are blocked, and on what exactly?
    - What did you NOT verify, and what needs a human on a real device?

  8. UPDATE PROGRESS.md with every phase's SHA, migration numbers, and counts.

═══════════════════════════════════════════════════════════════════════════════
FINAL REMINDERS
═══════════════════════════════════════════════════════════════════════════════

- Work in order. Each phase's tests must pass before the next begins. If a test
  fails, FIX it and re-run — do not skip forward and do not weaken the assertion.
- Stop only at a failed HARD GATE, and when you stop, say exactly what failed,
  what you observed, and what you recommend.
- Never build a parallel system. Before adding any table, component, or module,
  prove the existing one cannot be extended — the audit's reuse map (D5) exists
  precisely for this, and its central finding was that the project's problem is
  rarely a missing capability but a built capability that was never wired up.
- Persian UI strings stay Persian. Terminal output English.
- Never touch production 192.168.170.10.
- Commit before you build, because the image comes from the working tree.
- Keep HANDOFF STATE in docs/execution/p1-d8-progress.md current at all times.

START NOW with Phase 0.
