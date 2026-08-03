═══════════════════════════════════════════════════════════════════════════════
PHASE 7: Migrate Remaining ~20 Foreign Keys to person_id
Fully Automated Execution — Grouped by risk, tests at every checkpoint
═══════════════════════════════════════════════════════════════════════════════

OBJECTIVE:
Complete the unified-person model by repointing ALL remaining customer_id /
supplier_id / external_party_id foreign keys to persons(id). After Phase 5 only
three transaction tables (sales_quotes, purchases, payment_vouchers) reference
persons. This phase migrates the ~20 that still reference the legacy tables:
credit, receipts, product-supplier links, purchase prices, and the rest.

WHY THIS MATTERS:
The model is currently HALF-unified. suppliers.person_id and customers.person_id
are NOT NULL (Phase 6), so every legacy row already has a person — but downstream
tables still join through customer_id/supplier_id. Until they reference person_id,
the legacy tables cannot become views (Phase 8) and reporting stays split.

CONTEXT:
- Project: D:\AfraKalaTest\app
- Branch: feature/navigation-modernization
- DB: afrakala (Supabase at 192.168.170.8) — dev only, NEVER touch 192.168.170.10
- typecheck baseline: exactly 70 errors (never exceed)
- Existing person infra (all live):
  * persons, person_identifiers, person_aliases, person_context_links
  * person_create_inline, person_create_full, person_import_batch
  * person_fk_drift_report() — USE THIS after every migration
  * suppliers.person_id + customers.person_id are NOT NULL and enforced
  * person_merge_candidates (queue, 1 pending pair)

CRITICAL DEPLOY PROCEDURE (learned the hard way in Phases 5-6):
- `docker compose --force-recreate` and even `docker rm -f + up -d web` served
  STALE images while reporting a correct APP_GIT_SHA.
- The ONLY reliable deploy on this stack:
    docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml \
      up -d --build web
  (with GIT_SHA and BUILD_TIME env vars set — see how build.ps1/up.ps1 set them)
- VERIFY every deploy with BOTH signals, never SHA alone:
    docker exec afrakala-lan-web printenv APP_BUILD_TIME   → must be the fresh time
    docker exec afrakala-lan-web sh -c "grep -rl '<known-new-symbol>' /app 2>/dev/null | head -3"

GLOBAL CONSTRAINTS:
- Output terminal in English (LANG=en_US.UTF-8)
- auto-accept is ON — do NOT stop between checkpoints; fix-and-continue
- Persian UI strings stay Persian (CLAUDE.md rule 12)
- SQL with Persian text: docker cp + psql -f, NEVER pipe
- Before rebuilding ANY function/trigger: pg_get_functiondef first, diff, confirm
- Every migration reversible: ship an XXX-down.sql in docs/verification/ (OUT of migrations/)
- Read-only discovery against afrakala-lan-db; writes only via numbered migrations
- --single-transaction + ON_ERROR_STOP on every apply
- Commit at end of each checkpoint; record real SHAs + counts in PROGRESS.md

MIGRATION PATTERN (apply identically to every FK — this is the core recipe):
  For a table T with legacy column T.customer_id → customers(id):
    1. ADD COLUMN T.customer_person_id uuid REFERENCES persons(id)
       (name pattern: <role>_person_id, e.g. customer_person_id, supplier_person_id)
    2. BACKFILL: UPDATE T SET customer_person_id = c.person_id
                 FROM customers c WHERE T.customer_id = c.id;
    3. VERIFY: assert no row with non-null customer_id has null customer_person_id
       (RAISE EXCEPTION if any — abort the transaction)
    4. Add FK ... ON DELETE RESTRICT
    5. Keep the OLD column for now (drop is Phase 8) — dual-column during transition
    6. Only set NOT NULL if the old column was NOT NULL
  Same for supplier_id → supplier_person_id, external_party_id → *_person_id.
  For SQL FUNCTIONS/RPCs that read customer_id/supplier_id: update them to read
  the new person columns, but keep behavior identical (diff via pg_get_functiondef).

═══════════════════════════════════════════════════════════════════════════════
STEP 0: Discovery — Enumerate ALL Remaining FKs (read-only) + Baseline
═══════════════════════════════════════════════════════════════════════════════

The "~20 FKs" list is approximate. Get the AUTHORITATIVE list from the live schema:

1. Read PROGRESS.md and last 7 commits.

2. Enumerate every FK still pointing at customers/suppliers/external_parties:
   $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -c "
   SELECT
     con.conrelid::regclass::text AS table_name,
     att.attname                  AS fk_column,
     con.confrelid::regclass::text AS references_table,
     con.conname
   FROM pg_constraint con
   JOIN pg_attribute att
     ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
   WHERE con.contype = 'f'
     AND con.confrelid::regclass::text IN ('customers','suppliers','external_parties')
   ORDER BY references_table, table_name;"

   THIS is the real work list. Record it verbatim. Every row is one FK to migrate.

3. For each referencing table, capture row count + how many FK values are non-null:
   (loop the list; report a table: table_name | fk_column | total_rows | non_null_fk)

4. Enumerate SQL functions that read these legacy columns (they must be updated too):
   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -c "
   SELECT n.nspname, p.proname
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public'
     AND p.prosrc ~* '(customer_id|supplier_id|external_party_id)'
   ORDER BY 2;"
   Record this. Credit functions (get_customer_dynamic_credit, hold_credit,
   release_credit, get_customer_credit) are expected here and are HIGH RISK.

5. Application code that reads these columns:
   grep -rn "customer_id\|supplier_id\|external_party_id" src/ | grep -v node_modules \
     | grep -vE "person_id" | wc -l
   And list the files (not every line): grep -rl ... src/

6. Baseline:
   npx tsc --noEmit 2>&1 | grep -cE "error TS"     (70)
   npm run build                                    (pass)
   npx playwright test e2e/persons/ --reporter=list (13/13 green)
   person_fk_drift_report()                         (empty)

REPORT before proceeding: the authoritative FK table, the function list, the
count of affected code files, and confirm the baseline. Then assign each FK to a
group below (7.1–7.4). If a table is not in my grouping, slot it by risk and say so.
Continue automatically.

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 7.1 — GROUP A: Low-risk product/purchasing links
═══════════════════════════════════════════════════════════════════════════════
Tables (confirm against Step 0; typical members):
  product_suppliers.supplier_id, purchase_prices.supplier_id,
  purchase_order_items or similar supplier refs, any supplier catalog links.

These are structural joins with no money math on the FK itself — safest first.

FOR EACH table in Group A, apply the MIGRATION PATTERN:
  - migration 235_groupA_product_supplier_person_fks.sql (one migration, all Group A)
  - add <role>_person_id, backfill, verify zero orphans, add FK, NOT NULL if legacy was
  - update any SQL function in the Step-0 list that reads these tables' legacy cols
  - update application queries that JOIN these tables to also expose person data
    (do NOT remove the legacy column reads yet — dual-read during transition)

TESTS FOR 7.1 (run ALL before advancing):
  - DRY-RUN migration 235 in a ROLLBACK txn: assert every Group A table has 0
    rows where legacy FK non-null but new person FK null. Report per-table counts.
  - Apply for real (--single-transaction, ON_ERROR_STOP).
  - Post-verify per table: SELECT COUNT(*) FILTER (WHERE <fk> IS NOT NULL
    AND <fk>_person_id IS NULL) → 0 for each.
  - person_fk_drift_report() → still empty.
  - npx tsc --noEmit → 70; eslint touched → 0; npm run build → pass.
  - SQL probe: pick one product_suppliers row, assert its supplier_person_id
    resolves to the same person as suppliers.person_id for that supplier_id.

Ship 235-down.sql. Commit 7.1: "Phase 7.1: Group A product/purchasing person FKs (235)".
Record SHA + per-table backfill counts in PROGRESS.md.

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 7.2 — GROUP B: Receipts & delivery (business-critical, medium risk)
═══════════════════════════════════════════════════════════════════════════════
Tables (confirm against Step 0; typical members):
  payment_receipts.customer_id (+ any payer/receiver refs), delivery_receipts.*,
  receipt links, any external_parties refs on receipts.

These carry real financial evidence. External-party refs matter here: a receipt
payer/beneficiary may be a customer, a supplier, OR an external_party — all three
now have person_id, so each legacy ref maps to a person the same way.

FOR EACH table in Group B, apply the MIGRATION PATTERN, with care:
  - migration 236_groupB_receipt_person_fks.sql
  - For polymorphic payer/beneficiary (like payment_vouchers in Phase 5), add a
    single *_person_id and backfill from whichever legacy table the row points to
    (branch on the type/discriminator column — read it first).
  - external_parties.person_id: CONFIRM external_parties has a person_id column.
    If it does NOT (Phase 4 gave customers a bridge, suppliers got one in Phase 6,
    but external_parties may still lack one), STOP this sub-step and first add +
    backfill external_parties.person_id via person_import_batch-style matching,
    then continue. Report whether this extra step was needed.
  - Update receipt-reading SQL functions and queries to the person columns
    (dual-read; keep legacy).

TESTS FOR 7.2:
  - DRY-RUN 236 in ROLLBACK: per-table orphan count must be 0. Report them.
  - Special assertion for polymorphic refs: for each discriminator value
    (customer/supplier/external_party), assert the person FK resolves correctly.
  - Apply for real.
  - Post-verify: 0 orphans per table; person_fk_drift_report() empty.
  - tsc 70 / eslint 0 / build pass.
  - SQL probe on a real receipt: its payer_person_id equals the person_id of the
    legacy payer it pointed to.

Ship 236-down.sql. Commit 7.2: "Phase 7.2: Group B receipt/delivery person FKs (236)".
Record SHAs + counts + whether external_parties needed a person_id backfill.

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 7.3 — GROUP C: CREDIT (HIGHEST RISK — money math)
═══════════════════════════════════════════════════════════════════════════════
Tables + functions (confirm against Step 0; typical members):
  credit_* tables, customer_capital_allocations*, dynamic scoring tables,
  and the functions: get_customer_dynamic_credit, hold_credit, release_credit,
  get_customer_credit, and any calculate_* that read customer_id.

⚠️ THIS IS THE RISKY ONE. Credit rules decide whether sales can proceed and how
much capital a customer may use. A wrong backfill here corrupts business logic.
Proceed slower here than anywhere else.

MANDATORY EXTRA BACKUP before 7.3:
  docker exec -e PGPASSWORD=$pw afrakala-lan-db pg_dump -U supabase_admin -d afrakala \
    | gzip > D:\backups\afrakala\pre_phase7_3_credit_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql.gz
  Verify file exists, >1MB, and record its sha256.

APPROACH for 7.3:
  1. For every credit FUNCTION in the Step-0 list: pg_get_functiondef FIRST, save
     the original text to docs/verification/pre-237-<fnname>.sql. You will diff
     against these to prove behavior is unchanged except the column source.
  2. migration 237_groupC_credit_person_fks.sql:
     - Add <role>_person_id to each credit table, backfill, verify 0 orphans, FK.
     - Rewrite each credit function to read person_id-derived data. CRITICAL: the
       numeric result MUST be identical. Where a function currently looks up by
       customer_id, it should resolve customer_id → person_id (or read the new
       column) and produce the SAME number.
  3. Do NOT change any credit THRESHOLD, weight, or formula. Only the identity
     column being read changes.

TESTS FOR 7.3 (the strictest in this whole phase):
  - DRY-RUN 237 in ROLLBACK: 0 orphans per credit table. Report.
  - NUMERIC PARITY TEST (do this before real apply, inside a transaction):
    For a sample of real customers (at least 5, include خان محمدی if present):
      * capture OLD get_customer_credit / get_customer_dynamic_credit output
        BEFORE applying the function rewrite,
      * apply the rewrite inside the same txn,
      * capture NEW output,
      * assert OLD == NEW for every sampled customer.
    If ANY customer's number changes, ROLL BACK and report which one and why —
    do NOT apply. This is a hard gate.
  - Apply for real only after numeric parity passes.
  - Post-verify: 0 orphans; person_fk_drift_report() empty; re-run the numeric
    sample against the live function and confirm unchanged.
  - Diff each rewritten function against its pre-237 snapshot; the ONLY differences
    should be the identity-column source. Report the diffs.
  - tsc 70 / eslint 0 / build pass.

Ship 237-down.sql. Commit 7.3: "Phase 7.3: Group C credit person FKs — numeric parity proven (237)".
Record SHAs, backup sha256, and the numeric-parity sample results in PROGRESS.md.

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 7.4 — GROUP D: Everything else (invoices + stragglers)
═══════════════════════════════════════════════════════════════════════════════
Tables (confirm against Step 0): invoices.* (dead, 0 rows — migrate for schema
consistency but it's low-risk), plus any FK from Step 0 not yet covered by A/B/C.

  - migration 238_groupD_remaining_person_fks.sql
  - Apply the MIGRATION PATTERN to each. invoices is 0-row so backfill is trivial,
    but still add the column + FK so Phase 8 can convert customers/suppliers to
    views without dangling refs.
  - Sweep: after this migration, re-run the Step-0 FK enumeration query. It MUST
    return ZERO FKs still pointing at customers/suppliers/external_parties for the
    columns we set out to migrate (legacy columns may remain, but every table must
    now ALSO have its person FK). Report the final enumeration.

TESTS FOR 7.4:
  - DRY-RUN 238 in ROLLBACK: 0 orphans. 
  - Apply for real.
  - Re-run Step-0 enumeration: confirm every targeted table now has a person FK.
  - person_fk_drift_report() empty.
  - tsc 70 / eslint 0 / build pass.

Ship 238-down.sql. Commit 7.4: "Phase 7.4: Group D remaining person FKs (238)".
Record SHA + final enumeration in PROGRESS.md.

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 7.5 — Application Layer Sweep
═══════════════════════════════════════════════════════════════════════════════
Now that every table has a person FK, update the app to READ persons where it
matters for display/behavior, without breaking anything (dual-read stays).

  1. From the Step-0 file list, for each place that displays a customer/supplier
     name from a receipt/credit/product-supplier join, switch the display source
     to the person record (so names/links are consistent with Phase 5's quote
     detail behavior). Keep legacy reads as fallback — do not delete them.
  2. Anywhere a NEW record is created in these tables, ensure it writes the
     person FK (not only the legacy id). Grep for insert/upsert into the Group
     A–D tables and confirm each sets <role>_person_id.
  3. tsc 70 / eslint 0 / build pass.

Commit 7.5: "Phase 7.5: application reads/writes person FKs across domains".

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 7.6 — Build, Deploy, FULL e2e Regression (phase-end gate)
═══════════════════════════════════════════════════════════════════════════════

1. BUILD:
   npx tsc --noEmit   (70)
   npx eslint (all touched files)   (0 errors)
   bun run build   (pass)

2. DEPLOY (the ONLY reliable path — see CRITICAL DEPLOY PROCEDURE):
   docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml \
     up -d --build web
   Start-Sleep -Seconds 15

3. VERIFY DEPLOY (both signals):
   docker exec afrakala-lan-web printenv APP_BUILD_TIME    (fresh)
   docker exec afrakala-lan-web sh -c "grep -rl '<a-symbol-added-in-7.5>' /app 2>/dev/null | head -3"
   Invoke-WebRequest -Uri "http://192.168.170.8:3100/api/version" -UseBasicParsing | Select -ExpandProperty Content
   docker ps --filter name=afrakala-lan-web --format "{{.Status}}"   (Up healthy)

4. DB OBJECT VERIFICATION:
   $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
   # Confirm ZERO targeted legacy FKs remain without a person counterpart:
   (re-run the Step-0 enumeration; every targeted table must now have a *_person_id)
   # person_fk_drift_report() → empty
   # Credit numeric parity sample → unchanged vs pre-7.3

5. FULL E2E REGRESSION:
   npx playwright test e2e/persons/ --reporter=list
   Expected: all 13 existing green.

   THEN add + run NEW Phase 7 e2e specs (discover real routes/DOM first, like the
   previous suite did — do not guess selectors):

   a) e2e/persons/receipt-person-link.spec.ts
      - Open a payment receipt detail (discover the route under /accounting/…)
      - Assert the payer/customer name links to /persons/{uuid}
      - If none exists to click, navigate by a real id from DB and document why
        (same pattern the quote-link spec used)

   b) e2e/persons/credit-uses-person.spec.ts
      - For a customer with a known credit value, load the credit view
      - Assert the displayed credit number matches the DB function output
        (proves the person-based rewrite still yields the same number end-to-end)
      - Read-only; no data creation

   c) e2e/persons/product-supplier-person.spec.ts
      - Open a product's supplier info (discover route)
      - Assert the supplier shown resolves to the unified person
      - Read-only or create+cleanup with zero leftovers

   d) e2e/persons/purchase-price-person.spec.ts (if purchase_prices surfaces in UI)
      - Assert supplier on a purchase price resolves to the person
      - If not surfaced in UI, cover it with a DB-probe spec instead and say so

   Run the whole persons suite again — everything must be green:
   npx playwright test e2e/persons/ --reporter=list

6. DATA HYGIENE:
   - Any data-creating test cleans up in afterAll and asserts zero leftovers.
   - persons count returns to its baseline (report before/after).
   - person_fk_drift_report() → no drift.

═══════════════════════════════════════════════════════════════════════════════
FINAL: Commit + PROGRESS + Report
═══════════════════════════════════════════════════════════════════════════════

1. Commit remaining work:
   "Phase 7.6: deploy + full e2e regression — all FKs person-based"
2. Update PROGRESS.md: every migration SHA (235–238), the credit numeric-parity
   evidence, backup sha256s, final FK enumeration, persons count, e2e count.
3. FINAL REPORT — one table:

   | Domain | Tables migrated | Legacy FK | Person FK | Orphans | Status |
   |--------|-----------------|-----------|-----------|---------|--------|
   | Product/purchasing (A) | ? | kept | added | 0 | ✅ |
   | Receipts/delivery (B) | ? | kept | added | 0 | ✅ |
   | Credit (C) | ? | kept | added | 0 | ✅ numeric-parity proven |
   | Remaining/invoices (D) | ? | kept | added | 0 | ✅ |

   Plus:
   | Check | Result |
   |-------|--------|
   | Every targeted table now has *_person_id | YES/NO |
   | person_fk_drift_report() | empty? |
   | Credit numbers unchanged (sample of 5+) | YES/NO |
   | Deploy verified (APP_BUILD_TIME + grep) | YES/NO |
   | e2e persons suite | count, all green? |
   | tsc baseline | 70? |

   State clearly:
   - Do ANY targeted FKs still point only at customers/suppliers/external_parties
     without a person counterpart? (should be NONE)
   - Did any credit number change? (must be NO)
   - Are legacy tables now safe to convert to views in Phase 8? (all downstream
     refs have person FKs?)
   - What remains for Phase 8 (drop legacy columns / convert tables to views) and
     for the merge UI (still 1+ pending pair)?

REMEMBER:
- auto-accept is ON; do not stop between checkpoints. Fix failing tests, then advance.
- Group C (credit) is the hard gate: NO number may change. Roll back if it does.
- Keep legacy columns — dropping them is Phase 8, not now (dual-column/dual-read).
- Persian UI strings stay Persian.
- Never touch production 192.168.170.10.
- Deploy ONLY via `up -d --build web`; verify with APP_BUILD_TIME + symbol grep.
- Take the extra credit backup before 7.3.
- Report at each checkpoint; full report at the end.

START NOW with Step 0 (authoritative FK enumeration + baseline).
