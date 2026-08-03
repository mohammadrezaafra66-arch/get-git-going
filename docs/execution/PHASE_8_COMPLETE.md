═══════════════════════════════════════════════════════════════════════════════
PHASE 8: Identity Cardinality, Merge UI, external_parties, and Final Cleanup
Fully Automated · Slow and deliberate · Tests at every checkpoint · e2e at the end
═══════════════════════════════════════════════════════════════════════════════

READ THIS ENTIRE DOCUMENT BEFORE WRITING ANY CODE.

This phase closes the unified-person model. It contains FOUR business decisions
already made by the product owner. They are NOT open for redesign — implement
them as written. Where a decision creates a conflict with an earlier phase's
design, this document says explicitly which one wins.

───────────────────────────────────────────────────────────────────────────────
THE FOUR DECISIONS (owner-approved, binding)
───────────────────────────────────────────────────────────────────────────────

DECISION 1 — ONE PERSON = ONE CUSTOMER (hard cardinality)
  customers.person_id must become UNIQUE. A person may never have two customer
  records. Duplicates must be MERGED first, not tolerated.
  Consequence: credit is unambiguous — one person, one customer, one credit line.
  Same rule applies to suppliers.person_id (one person = one supplier).
  Accepted trade-off: a real-world entity that wants two separate accounts cannot
  have them. The owner accepts this.

DECISION 2 — ONE MOBILE = ONE PERSON, NEVER DUPLICATED (global uniqueness)
  A mobile number identifies exactly one person, globally, regardless of whether
  it is 'provisional' or 'confirmed'.
  ⚠️ THIS OVERRIDES A PHASE 2 DESIGN DECISION. Migration 228 deliberately made
  mobile_e164/landline/email unique ONLY when confirmed, so that a typo'd or
  provisional number would not permanently block its real owner. The owner has
  now chosen strict global uniqueness instead. Implement the new rule, but:
    - Report in your final summary that this reverses migration 228's B3 split.
    - Before applying, find and report EVERY existing collision (same normalized
      mobile on two persons). These MUST be merged or corrected first — the
      constraint cannot be added while collisions exist.
    - Known collision today: +989122270261 is shared by «تست دستی من» and
      «محمدرضا افرا» (this is the pending merge pair).
  Keep national_id_ir / tax_id_ir / company_reg_id_ir / iban globally unique as
  they already are.

DECISION 3 — external_parties GETS THE SAME TREATMENT suppliers GOT IN PHASE 6
  Step A: the external-party creation form(s) must route through the person RPC
          so every new party creates/links a person atomically.
  Step B: backfill every existing external_parties row that has person_id NULL.
  Step C: ALTER external_parties.person_id SET NOT NULL.
  Same pattern, same rigor, same tests as Phase 6.1–6.3.

DECISION 4 — BUILD A REAL MERGE UI
  A full page, not a SQL-only workflow. It must let a human review a candidate
  pair, see the evidence, and either merge them or dismiss the pair. Merging must
  be transactional and must repoint every reference from the losing person to the
  winning person before deleting/deactivating the loser.

───────────────────────────────────────────────────────────────────────────────
ORDERING IS NOT NEGOTIABLE
───────────────────────────────────────────────────────────────────────────────
The four decisions have hard dependencies. Execute in exactly this order:

  8.1  Merge infrastructure (RPC) + Merge UI          ← needed to resolve dupes
  8.2  Resolve all pending merge candidates            ← clears the way
  8.3  UNIQUE on customers.person_id / suppliers.person_id  (Decision 1)
  8.4  Global mobile uniqueness                        (Decision 2)
  8.5  external_parties → RPC + backfill + NOT NULL    (Decision 3)
  8.6  Credit functions rewritten onto person_id       ← ONLY safe after 8.3
  8.7  Legacy cleanup: drop legacy FK columns, convert tables
  8.8  Deploy + FULL e2e regression + final report

Doing 8.3 before 8.2 fails (duplicates violate the constraint).
Doing 8.4 before 8.2 fails (the collision is a duplicate).
Doing 8.6 before 8.3 is DANGEROUS (credit would double-count across two customers
sharing a person — this is exactly why Phase 7 correctly refused to rewrite them).
Doing 8.7 before 8.5 leaves dangling references.

───────────────────────────────────────────────────────────────────────────────
CONTEXT
───────────────────────────────────────────────────────────────────────────────
- Project: D:\AfraKalaTest\app
- Branch: feature/navigation-modernization
- DB: afrakala (Supabase at 192.168.170.8). NEVER touch production 192.168.170.10.
- typecheck baseline: exactly 70 errors. Never exceed. Report the number each time.
- Live person infrastructure:
  * persons, person_identifiers, person_aliases, person_context_links
  * person_merge_candidates (queue; ≥1 pending pair)
  * person_create_inline, person_create_full, person_import_batch
  * person_fk_drift_report()  ← run after EVERY migration
  * suppliers.person_id and customers.person_id are already NOT NULL (Phase 6)
  * Phase 7 added *_person_id columns across ~20 tables (legacy columns kept)

CRITICAL DEPLOY PROCEDURE (learned painfully in Phases 5–7):
  `--force-recreate` and even `docker rm -f && up -d web` have both served STALE
  images while reporting a correct-looking APP_GIT_SHA. The ONLY reliable deploy:
      docker compose --env-file deploy/lan/.env.lan \
        -f deploy/lan/docker-compose.yml up -d --build web
  Verify with BOTH signals, never SHA alone:
      docker exec afrakala-lan-web printenv APP_BUILD_TIME     → must be fresh
      docker exec afrakala-lan-web sh -c "grep -rl '<new-symbol>' /app 2>/dev/null | head -3"

───────────────────────────────────────────────────────────────────────────────
GLOBAL WORKING RULES
───────────────────────────────────────────────────────────────────────────────
- WORK SLOWLY AND DELIBERATELY. This phase touches identity and money. Prefer an
  extra verification query over an assumption. If something is ambiguous, inspect
  the schema/code rather than guessing, and say "uncertain" when it is uncertain.
- auto-accept is ON: do NOT stop to ask permission. But DO stop and report if a
  hard gate fails (defined per checkpoint) instead of forcing past it.
- Terminal output in English (LANG=en_US.UTF-8). Persian UI strings stay Persian.
- SQL containing Persian text: docker cp + psql -f. NEVER pipe it.
- Before rebuilding ANY function/trigger: pg_get_functiondef first, save a
  snapshot under docs/verification/, diff afterwards, report the diff.
- Every migration: --single-transaction + ON_ERROR_STOP, and a matching
  XXX-down.sql in docs/verification/ (deliberately NOT in supabase/migrations/).
- Dry-run every migration inside a ROLLBACK transaction before applying for real.
- Commit at the end of each checkpoint. Record real SHAs and row counts in
  PROGRESS.md.
- Take a pg_dump backup before 8.3, 8.4, and 8.7 (each is irreversible-ish).

═══════════════════════════════════════════════════════════════════════════════
STEP 0 — Discovery and Baseline (read-only, no changes)
═══════════════════════════════════════════════════════════════════════════════

1. Read PROGRESS.md, CLAUDE.md, AGENTS.md, and the last 10 commits.

2. Establish the identity landscape. Run and REPORT each result:

   $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()

   a) Cardinality violations for Decision 1:
      SELECT person_id, COUNT(*) c, array_agg(id) customer_ids
      FROM public.customers GROUP BY person_id HAVING COUNT(*) > 1;
      -- and the same for suppliers
      → Any row here BLOCKS 8.3 until merged. Report the exact list.

   b) Mobile collisions for Decision 2:
      SELECT i.value_normalized, COUNT(DISTINCT i.person_id) persons,
             array_agg(DISTINCT p.display_name) names,
             array_agg(DISTINCT i.status) statuses
      FROM public.person_identifiers i
      JOIN public.persons p ON p.id = i.person_id
      WHERE i.kind IN ('mobile_e164','landline','email')
      GROUP BY i.value_normalized
      HAVING COUNT(DISTINCT i.person_id) > 1;
      → Any row BLOCKS 8.4 until merged/corrected. Report exact list.

   c) Pending merge candidates:
      SELECT * FROM public.person_merge_candidates WHERE status = 'pending';
      → Report the pairs, with both persons' names and identifiers.

   d) external_parties state (Decision 3):
      SELECT COUNT(*) total, COUNT(*) FILTER (WHERE person_id IS NULL) nulls
      FROM public.external_parties;
      -- also: does the column even exist? \d external_parties
      → Report. If person_id does not exist at all, 8.5 must add it.

   e) Every table that references persons (needed by the merge RPC in 8.1):
      SELECT con.conrelid::regclass::text AS table_name,
             att.attname AS column_name, con.conname
      FROM pg_constraint con
      JOIN pg_attribute att ON att.attrelid = con.conrelid
                           AND att.attnum = ANY(con.conkey)
      WHERE con.contype='f' AND con.confrelid = 'public.persons'::regclass
      ORDER BY 1,2;
      → THIS LIST IS THE MERGE RPC'S WORK LIST. Every one of these columns must
        be repointed when two persons merge. Record it verbatim; the merge RPC
        must handle all of them, and must FAIL LOUDLY if it encounters a
        persons-referencing column it does not know about.

   f) Credit functions (needed in 8.6):
      SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosrc ~* 'customer_id'
        AND p.proname ~* '(credit|capital|score)'
      ORDER BY 1;
      → Snapshot each with pg_get_functiondef into docs/verification/pre-phase8/.

   g) Legacy columns still present (needed in 8.7):
      For every table that has BOTH a legacy customer_id/supplier_id/
      external_party_id AND a *_person_id, list them. This is 8.7's work list.

3. Baseline health:
   npx tsc --noEmit 2>&1 | grep -cE "error TS"        → expect 70
   npm run build                                       → expect pass
   npx playwright test e2e/persons/ --reporter=list    → expect all green (13+)
   SELECT * FROM public.person_fk_drift_report();      → expect empty

4. REPORT a consolidated table before continuing:
   | Check | Finding | Blocks which checkpoint |
   Then continue automatically to 8.1.

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 8.1 — Merge Infrastructure (RPC) + Merge UI   [Decision 4]
═══════════════════════════════════════════════════════════════════════════════
GOAL: A human can review a duplicate pair and merge it safely from a real page.

PART A — The merge RPC (migration 239)

Create person_merge(p_winner_id uuid, p_loser_id uuid, p_reason text)
RETURNS jsonb, SECURITY INVOKER, search_path=public.

Behavior, in one transaction:
  1. Guard: winner ≠ loser; both exist; both active. Persian error messages.
  2. Guard: caller must be admin or manager (use the project's existing role
     check — read how other RPCs do it; do NOT invent a new mechanism).
  3. Repoint EVERY column from Step 0(e) from loser → winner. Build this list
     from the actual catalog at write time; do not hardcode a stale list.
     ⚠️ HARD REQUIREMENT: if a persons-referencing FK column exists that the RPC
     does not explicitly handle, it must RAISE EXCEPTION rather than silently
     leave a dangling reference. A merge that misses a table is a data-loss bug.
  4. Move identifiers: loser's person_identifiers rows move to winner, EXCEPT
     where the winner already has the same (kind, value_normalized) — in that
     case delete the loser's duplicate row rather than violating uniqueness.
  5. Move aliases the same way; additionally, insert the loser's display_name as
     an alias of the winner (so search still finds the old name).
  6. Move person_context_links; de-duplicate identical (context_kind, ref_table,
     ref_id) pairs.
  7. ⚠️ CARDINALITY: if both winner and loser own a customer row (or both own a
     supplier row), that is a customer-level merge and is OUT OF SCOPE for this
     RPC. RAISE EXCEPTION with a clear Persian message telling the operator that
     the two customer records must be reconciled first. Do NOT silently merge
     two customers — balances, credit and history would be at stake.
     (Report how many pending pairs fall into this category.)
  8. Mark the loser inactive (is_active=false) and record the merge:
     write a person_merge_log row (create the table in this migration) with
     winner_id, loser_id, reason, merged_by, merged_at, and a jsonb of what was
     repointed (table→count). Do NOT hard-delete the loser: its id may appear in
     audit logs.
  9. Update person_merge_candidates: set the pair's status='merged'.
 10. Return jsonb: {winner_id, loser_id, repointed: {...}, identifiers_moved,
     aliases_moved, links_moved}.

Also add person_merge_dismiss(p_candidate_id uuid, p_reason text) which sets
status='dismissed' with a reason — for pairs that are genuinely two people.

PART B — The Merge UI

Create a page (follow the project's existing routing convention; discover it
rather than guessing the filename) at /persons/merge that:
  - Lists pending person_merge_candidates.
  - For each candidate, shows BOTH persons side by side: display_name, kind,
    identifiers (raw + normalized), aliases, linked contexts (customer/supplier),
    created_at, and a count of referencing transactions per person.
  - Lets the reviewer pick which side is the WINNER (radio/toggle), enter a
    reason, and press «ادغام» — calling person_merge.
  - Offers «این‌ها یک نفر نیستند» which calls person_merge_dismiss with a reason.
  - Shows a clear warning when the pair would hit guard #7 (both have a customer
    or both have a supplier), and disables merge for that pair with an
    explanatory Persian message.
  - RTL, Persian labels, mobile-first, consistent with existing pages.
  - Access: admin/manager only, using the project's existing guard
    (requireAnyRole from route-guards.ts — reuse it, do NOT hand-roll an
    ensureAuthReady check; Phase 6.7 proved hand-rolled guards break under SSR).
  - Labels wired with htmlFor/id (the a11y lesson from Phase 6.5).

TESTS FOR 8.1 (all must pass before advancing):
  - Dry-run migration 239 in a ROLLBACK transaction.
  - SQL test suite (inside ROLLBACK), asserting:
      T1. Merge two synthetic persons: all FK columns from Step 0(e) repoint.
      T2. Duplicate identifier on both sides → winner keeps one, no unique violation.
      T3. Loser's display_name becomes an alias of the winner.
      T4. Both-have-customer pair → RAISES (guard #7), nothing changed.
      T5. Non-admin caller → RAISES 42501.
      T6. person_merge_log row written with correct repoint counts.
      T7. Candidate status flips to 'merged'.
      T8. Dismiss sets status='dismissed' and changes no person data.
      T9. Unknown persons-referencing column → RAISES (simulate by checking the
          RPC's catalog-completeness guard, or assert the guard exists).
    Report pass/fail per assertion.
  - Apply migration 239 for real. person_fk_drift_report() → empty.
  - npx tsc --noEmit → 70 · eslint touched → 0 · npm run build → pass.

Ship 239-down.sql. Commit 8.1: "Phase 8.1: person merge RPC + merge review UI (239)".

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 8.2 — Resolve All Pending Merge Candidates
═══════════════════════════════════════════════════════════════════════════════
GOAL: Zero pending candidates, and zero mobile collisions, so 8.3/8.4 can proceed.

BACKUP FIRST:
  pg_dump → D:\backups\afrakala\pre_phase8_2_merge_<timestamp>.sql.gz (record sha256)

1. Re-run the collision queries from Step 0(a) and 0(b). For EACH pending pair
   and EACH mobile collision, classify it and REPORT the classification:
     Class A — clearly the same entity, only one side has a customer/supplier:
               → merge via person_merge (pick the side with more references as
                 winner; state your choice and why).
     Class B — clearly two different people who share a number (e.g. a landline,
               a reassigned mobile, or a test record):
               → do NOT merge. Either dismiss the candidate, or correct the
                 identifier (e.g. the test record's number is wrong).
     Class C — both sides have a customer or both have a supplier:
               → guard #7 blocks it. STOP and REPORT this pair for the owner to
                 decide. Do not force it.

2. Known case to handle explicitly:
   +989122270261 is on «تست دستی من» (a leftover manual-test person) and on
   «محمدرضا افرا» (a real person). This is Class B-ish: the test record is not a
   real human. Recommended handling — REPORT before doing it, then do it:
     - If «تست دستی من» has NO transactions referencing it, remove its identifier
       (or deactivate the person) rather than merging test data into a real
       person's identity. Merging test junk into a real customer pollutes history.
     - If it DOES have references, merge it INTO «محمدرضا افرا» (real person
       wins) with reason "manual test record consolidated".
   State which branch you took and the evidence.

3. After resolution, re-run both collision queries. Both MUST return zero rows.
   HARD GATE: if either still returns rows, STOP and report. Do not proceed to
   8.3/8.4 with known violations.

TESTS FOR 8.2:
  - Collision queries return 0 rows (both).
  - person_merge_candidates has 0 rows with status='pending' (or, if any remain,
    they are Class C and explicitly reported as owner-blocked).
  - person_fk_drift_report() → empty.
  - Transaction counts preserved: for each merged pair, assert the winner now has
    the SUM of both sides' referencing rows (no rows lost).
  - persons count: report before/after (it should not drop; losers are
    deactivated, not deleted).

Commit 8.2: "Phase 8.2: resolved pending merge candidates and mobile collisions".

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 8.3 — Enforce ONE PERSON = ONE CUSTOMER / ONE SUPPLIER  [Decision 1]
═══════════════════════════════════════════════════════════════════════════════
GOAL: customers.person_id and suppliers.person_id become UNIQUE.

BACKUP FIRST: pre_phase8_3_cardinality_<timestamp>.sql.gz (record sha256).

migration 240_person_customer_cardinality.sql:
  1. Re-assert zero duplicates (RAISE EXCEPTION if any) — belt and braces.
  2. CREATE UNIQUE INDEX (concurrently is NOT possible inside a transaction; use
     a plain unique index/constraint since this is a small dev dataset — state
     the choice) on customers(person_id) and suppliers(person_id).
     Consider whether the uniqueness should be partial (e.g. only WHERE
     is_active) — INSPECT whether customers/suppliers have a soft-delete or
     is_active column first, and REPORT your reasoning. If soft-deleted rows
     exist, a partial unique index on active rows is correct; otherwise a plain
     unique constraint is correct. Choose based on the real schema, not theory.
  3. Add a COMMENT on each constraint explaining the business rule in Persian.

⚠️ SIDE EFFECT TO HANDLE: person_create_inline currently creates a customer or
   supplier row every time it is called with that context. With uniqueness, a
   second call for the SAME person in the SAME context will now fail. Update
   person_create_inline so that, when a person already has a customer/supplier
   row, it REUSES the existing legacy row instead of inserting a duplicate, and
   returns that legacy_id. Snapshot the function first, diff after, report.

TESTS FOR 8.3:
  - Dry-run 240 in ROLLBACK: succeeds, and a deliberate duplicate insert is
    rejected with unique_violation.
  - Apply for real.
  - Post-verify:
      * Attempt to INSERT a second customer with an existing person_id → must be
        rejected (assert the error code).
      * person_create_inline called twice for the same person+context → returns
        the SAME legacy_id both times, creates no duplicate row.
      * Existing row counts unchanged (report customers/suppliers counts before/after).
  - person_fk_drift_report() → empty.
  - tsc 70 · eslint 0 · build pass.

Ship 240-down.sql. Commit 8.3: "Phase 8.3: one person = one customer/supplier (240)".

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 8.4 — Global Mobile Uniqueness  [Decision 2]
═══════════════════════════════════════════════════════════════════════════════
GOAL: one mobile = one person, always. Overrides migration 228's B3 split.

BACKUP FIRST: pre_phase8_4_mobile_unique_<timestamp>.sql.gz (record sha256).

migration 241_global_contact_uniqueness.sql:
  1. Re-assert zero collisions (RAISE EXCEPTION if any).
  2. Read the CURRENT constraints on person_identifiers first
     (uq_person_identifiers_strong_active, uq_person_identifiers_confirmed_kind_value)
     and report them, so the change is a deliberate replacement, not a blind add.
  3. Replace the confirmed-only uniqueness for mobile_e164 (and landline, email —
     apply the same rule; state explicitly which kinds you covered) with a global
     unique index on (kind, value_normalized) for ACTIVE identifiers, regardless
     of status.
  4. Keep national_id_ir / tax_id_ir / company_reg_id_ir / iban globally unique
     as they already are — do not weaken them.
  5. COMMENT explaining that this supersedes the Phase 2 B3 decision, with the date.

⚠️ UX CONSEQUENCE — HANDLE IT: with global uniqueness, entering a number that
   already belongs to someone else now fails. A raw Postgres unique_violation is
   a terrible user experience. Ensure the error surfaces as a clear Persian
   message naming the conflict, e.g. «این شماره قبلاً برای شخص دیگری ثبت شده
   است». Implement this in the RPC/trigger error path AND make sure PersonForm /
   PersonModal display it. Better still: before insert, look up the owning person
   and offer the operator a link to it. Implement at minimum the clear message;
   implement the link if it is straightforward.

TESTS FOR 8.4:
  - Dry-run 241 in ROLLBACK.
  - Assertions (inside ROLLBACK):
      * Two persons with the same provisional mobile → second one REJECTED
        (this is the behavior REVERSAL vs Phase 2 — assert it explicitly).
      * Same mobile, one active + one soft-deleted/inactive identifier → allowed
        (only active rows collide) — confirm this matches the index you wrote.
      * National ID uniqueness still enforced.
      * The Persian error message is raised, not a bare constraint name.
  - Apply for real.
  - Re-run the collision query → 0 rows.
  - tsc 70 · eslint 0 · build pass.

Ship 241-down.sql. Commit 8.4: "Phase 8.4: global mobile/contact uniqueness (241) — supersedes 228 B3".

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 8.5 — external_parties gets the Phase-6 treatment  [Decision 3]
═══════════════════════════════════════════════════════════════════════════════
GOAL: every external party has a person; new ones cannot be created without one.

PART A — Route the form through the RPC
  1. Find every creation path for external_parties (forms, dialogs, server
     actions, RPCs, imports). Use the same grep discipline as Phase 6:
       grep -rn "external_parties" src/ | grep -viE "person_id" 
     Report the list.
  2. Extend person_create_inline to accept context_kind='external_party' with
     context_ref_table='external_parties' (if it does not already), reusing the
     p_legacy_fields mechanism added in Phase 6 (migration 232) so
     external-party-specific fields survive. Snapshot + diff the function.
  3. Rewire each creation path to the RPC. Preserve every field the form
     collects (the «کد آسان» / receipt state-2 flow is a live consumer — do NOT
     break it; read that flow before changing anything).

PART B — Backfill
  4. migration 242: backfill external_parties.person_id for all NULL rows using
     the same identity-matching person_import_batch uses (match normalized mobile
     if present, else create a fresh person from the party's name).
     ⚠️ With 8.4 in force, matching now MUST link rather than create when the
     number already exists — verify this is what happens, and report how many
     rows linked vs created.
  5. Verify zero NULLs remain (RAISE EXCEPTION otherwise).

PART C — Enforce
  6. ALTER external_parties.person_id SET NOT NULL.
  7. Decide, and report, whether external_parties.person_id should ALSO be
     UNIQUE. Note this is NOT one of the four decisions — Decision 1 covered
     customers and suppliers only. Default to NOT adding uniqueness here, and
     explain the reasoning in the report (an external party may plausibly be a
     second role of the same person). Flag it for the owner.

TESTS FOR 8.5:
  - Dry-run 242 in ROLLBACK: 0 NULLs afterwards; report linked-vs-created split.
  - Apply for real.
  - Post-verify: NULL count = 0; NOT NULL constraint present; a bare INSERT
    without person_id is rejected with not_null_violation.
  - Receipt state-2 flow still works: create an external party through that path
    in a ROLLBACK transaction and assert it produced a person + context link.
  - person_fk_drift_report() → empty.
  - tsc 70 · eslint 0 · build pass.

Ship 242-down.sql. Commit 8.5: "Phase 8.5: external_parties person_id enforced (242)".

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 8.6 — Rewrite Credit Functions onto person_id
═══════════════════════════════════════════════════════════════════════════════
GOAL: finish what Phase 7 correctly refused to do — now that 8.3 guarantees
one person = one customer, credit can be person-based without double-counting.

BACKUP FIRST: pre_phase8_6_credit_<timestamp>.sql.gz (record sha256).

  1. For each credit function from Step 0(f), you already have a snapshot in
     docs/verification/pre-phase8/. Re-read them.
  2. migration 243: rewrite each to resolve identity through person_id.
     ⚠️ ABSOLUTE RULE: no threshold, weight, formula, or rounding may change.
     The ONLY change is which column identifies the party.
  3. NUMERIC PARITY GATE — this is the hardest gate in the entire project:
       a) BEFORE applying, capture the output of every credit function for a
          sample of at least 8 real customers (include «خان محمدی» if present,
          plus the highest-credit and lowest-credit customers, plus any customer
          involved in an 8.2 merge).
       b) Apply the rewrite INSIDE a transaction.
       c) Capture the outputs again.
       d) Assert OLD == NEW for every sampled customer and every function.
       e) If ANY value differs by any amount: ROLL BACK, report which customer,
          which function, old value, new value, and your analysis of why. DO NOT
          APPLY. This gate exists to protect real money decisions.
  4. Only after parity passes, apply for real.
  5. Diff every rewritten function against its snapshot and report the diffs —
     they should show only the identity-source change.

TESTS FOR 8.6:
  - Numeric parity: 8+ customers × every credit function, OLD == NEW. Report the
    full table of values.
  - Post-apply: re-run the sample against the live functions; still identical.
  - A customer whose person was a merge WINNER in 8.2: assert its credit equals
    what the surviving customer had before the merge (not a sum).
  - person_fk_drift_report() → empty.
  - tsc 70 · eslint 0 · build pass.

Ship 243-down.sql. Commit 8.6: "Phase 8.6: credit functions person-based, numeric parity proven (243)".

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 8.7 — Legacy Cleanup
═══════════════════════════════════════════════════════════════════════════════
GOAL: retire the legacy identity columns and tables now that everything is
person-based.

BACKUP FIRST: pre_phase8_7_cleanup_<timestamp>.sql.gz (record sha256).

⚠️ BE CONSERVATIVE HERE. Dropping a column is irreversible in practice. Follow
this order and STOP at the first sign of a remaining consumer.

  1. From Step 0(g), take the list of tables holding BOTH a legacy id and a
     person id. For EACH one, prove there is no remaining reader:
       - grep the codebase for that column name (excluding the person variant)
       - grep SQL function bodies for it
       - check views
     Report a per-column table: column | code refs | function refs | view refs |
     safe to drop? If ANY refs remain, FIX them first (switch to the person
     column) rather than dropping.

  2. migration 244_drop_legacy_identity_columns.sql:
       - Drop only the columns proven unreferenced in step 1.
       - Keep any column still referenced, and list it in the report as deferred.
       - Do this table by table with a verification query between each.

  3. customers / suppliers tables themselves:
       ⚠️ DO NOT DROP THEM. Decision 1 makes them 1:1 profile tables for
       person-specific business data (credit terms, settlement terms). They now
       have a legitimate role as PROFILE tables, not as identity tables.
       Instead:
         - Update their COMMENT to state clearly that they are profile tables
           keyed 1:1 to persons, and that identity lives in persons.
         - Verify no code treats them as an identity source anymore (they should
           only ever be reached via person_id).
       Report whether any code still queries customers/suppliers by name/phone
       as if they were identity — those are the last holdouts.

  4. Convert nothing to a VIEW in this phase unless step 1 proves it is trivially
     safe. If you believe a view conversion is warranted, write the plan and the
     migration but do NOT apply it — leave it for owner approval and say so.
     Rationale: view-vs-table conversion broke inserts in similar migrations
     elsewhere; the risk is not worth taking automatically.

TESTS FOR 8.7:
  - Dry-run 244 in ROLLBACK.
  - After the dry-run, run the FULL e2e suite against the rolled-back state? No —
    instead: apply 244 for real, then immediately run the full app checks below.
  - Post-verify: every dropped column is gone; every kept column is documented as
    deferred with the reason.
  - person_fk_drift_report() → empty.
  - tsc 70 · eslint 0 · npm run build → pass.

Ship 244-down.sql (note honestly that re-adding a dropped column restores the
column but NOT its data — the backup is the real recovery path).
Commit 8.7: "Phase 8.7: drop unreferenced legacy identity columns (244)".

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 8.8 — Build, Deploy, FULL e2e Regression, Final Report
═══════════════════════════════════════════════════════════════════════════════

1. BUILD:
   npx tsc --noEmit                 → 70
   npx eslint (all touched files)   → 0 errors
   bun run build                    → pass

2. DEPLOY (the ONLY reliable path):
   docker compose --env-file deploy/lan/.env.lan \
     -f deploy/lan/docker-compose.yml up -d --build web
   Start-Sleep -Seconds 15

3. VERIFY DEPLOY (both signals, never SHA alone):
   docker exec afrakala-lan-web printenv APP_BUILD_TIME       → fresh
   docker exec afrakala-lan-web sh -c "grep -rl 'person_merge' /app 2>/dev/null | head -3"
   Invoke-WebRequest -Uri "http://192.168.170.8:3100/api/version" -UseBasicParsing
   docker ps --filter name=afrakala-lan-web --format "{{.Status}}"   → Up (healthy)

4. DB VERIFICATION (report every value):
   - customers.person_id UNIQUE?           → yes
   - suppliers.person_id UNIQUE?           → yes
   - external_parties.person_id NOT NULL?  → yes
   - mobile collisions                     → 0
   - customer/supplier person duplicates   → 0
   - pending merge candidates              → 0 (or Class C, listed)
   - person_fk_drift_report()              → empty
   - credit numeric sample                 → identical to pre-8.6

5. FULL E2E REGRESSION — the phase gate.
   First, the existing suite:
     npx playwright test e2e/persons/ --reporter=list   → all green

   Then WRITE AND RUN new Phase 8 specs. Discover real routes and DOM first
   (the earlier suites proved that guessing selectors wastes time). Remember:
   getByRole name matching is substring by default — use exact:true.

   a) e2e/persons/merge-ui.spec.ts
      - Open /persons/merge as admin
      - Assert the pending list renders (seed a synthetic candidate pair in
        beforeAll so the test is deterministic; clean up in afterAll)
      - Assert both persons' details are shown side by side
      - Merge them via the UI; assert the RPC succeeded and the candidate's
        status became 'merged'
      - Assert references repointed (DB probe)
      - Assert the loser is inactive, not deleted
      - Cleanup, assert zero leftovers

   b) e2e/persons/merge-ui-guard.spec.ts
      - Seed a pair where BOTH persons own a customer
      - Assert the UI shows the warning and the merge action is disabled
      - Assert calling the RPC directly for that pair raises
      - Cleanup

   c) e2e/persons/duplicate-mobile-blocked.spec.ts
      - Create a person with a mobile
      - Attempt to create a SECOND person with the same mobile from the UI
      - Assert a clear Persian error appears (not a raw constraint name)
      - Assert no second person was created
      - Cleanup

   d) e2e/persons/one-person-one-customer.spec.ts
      - Take a person who already has a customer
      - Attempt to create a second customer for them through the UI path
      - Assert it either reuses the existing customer or is blocked with a clear
        message — assert whichever behavior 8.3 implemented, and say which
      - Cleanup

   e) e2e/persons/external-party-person.spec.ts
      - Create an external party through its real form (including the receipt
        state-2 «کد آسان» flow if that is the live path)
      - Assert the created external_parties row has a non-null person_id and a
        person_context_links row
      - Cleanup, assert zero leftovers

   f) e2e/persons/credit-unchanged.spec.ts
      - For 3+ customers, assert the credit shown in the UI equals the DB
        function output (end-to-end proof that 8.6 did not shift numbers)
      - Read-only

   Re-run the entire suite; EVERYTHING must be green:
     npx playwright test e2e/persons/ --reporter=list

6. DATA HYGIENE:
   - Every data-creating spec cleans up in afterAll and asserts zero leftovers.
   - Report persons/customers/suppliers/external_parties counts before and after
     the whole phase.
   - person_fk_drift_report() → no drift.

7. FINAL REPORT — produce this table plus prose:

   | Decision | Implemented | Evidence | Status |
   |---|---|---|---|
   | 1. One person = one customer | ? | unique index name + rejected-insert test | ? |
   | 2. One mobile = one person | ? | global unique index + reversal note vs 228 | ? |
   | 3. external_parties like suppliers | ? | NOT NULL + backfill counts | ? |
   | 4. Merge UI | ? | route + e2e specs | ? |

   | Checkpoint | Migration | Commit SHA | Tests | Status |
   |---|---|---|---|---|
   | 8.1 merge RPC + UI | 239 | ? | 9 SQL assertions | ? |
   | 8.2 resolve candidates | – | ? | collisions = 0 | ? |
   | 8.3 cardinality | 240 | ? | duplicate insert rejected | ? |
   | 8.4 mobile uniqueness | 241 | ? | reversal asserted | ? |
   | 8.5 external_parties | 242 | ? | NULLs = 0 | ? |
   | 8.6 credit person-based | 243 | ? | numeric parity 8+ customers | ? |
   | 8.7 legacy cleanup | 244 | ? | per-column ref proof | ? |
   | 8.8 deploy + e2e | – | ? | full suite green | ? |

   Answer these directly:
   - Did any credit number change anywhere? (must be NO — if YES, what and why)
   - Are there any remaining mobile collisions or person/customer duplicates? (must be 0)
   - Which pairs, if any, are Class C and still need the owner's decision?
   - Which legacy columns were NOT dropped, and why?
   - Is external_parties.person_id unique? (expected: no — flagged for owner)
   - What is left for a future phase?

   Also state honestly: what did you NOT verify, and what would you want a human
   to click through before this is trusted in production?

───────────────────────────────────────────────────────────────────────────────
FINAL REMINDERS
───────────────────────────────────────────────────────────────────────────────
- Work slowly. Verify rather than assume. Say "uncertain" when uncertain.
- auto-accept is ON: do not stop for permission — but DO stop at a failed hard
  gate (8.2 collisions, 8.3 duplicates, 8.6 numeric parity) and report.
- Backups before 8.3, 8.4, 8.6, 8.7. Record every sha256.
- Persian UI strings stay Persian. Terminal output English.
- Never touch production 192.168.170.10.
- Deploy ONLY via `up -d --build web`; verify APP_BUILD_TIME + symbol grep.
- Update PROGRESS.md at every checkpoint with real SHAs and counts.

START NOW with STEP 0.
