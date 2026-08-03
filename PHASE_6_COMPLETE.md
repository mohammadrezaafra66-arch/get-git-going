═══════════════════════════════════════════════════════════════════════════════
PHASE 6: Close Person Creation Gaps + Fix Remaining UI Bugs
Fully Automated Execution — Step-by-step with tests at each checkpoint
═══════════════════════════════════════════════════════════════════════════════

OBJECTIVE:
Route ALL person/customer/supplier creation through person_create_inline so that
customers.person_id and suppliers.person_id can finally become NOT NULL.
Fix the 4 UI bugs discovered by the Phase 3-5 e2e suite.
End with a full e2e regression run.

WHY THIS MATTERS:
Right now SupplierForm, CustomerForm, and SupplierReferralModal still INSERT rows
without a person_id. Proof: a supplier named "api" exists with person_id=NULL,
created outside our tests. Until every write path goes through person_create_inline,
the person model has holes and the FK columns cannot be made mandatory.

CONTEXT:
- Project: D:\AfraKalaTest\app
- Branch: feature/navigation-modernization
- DB: afrakala (Supabase at 192.168.170.8) — dev only, NEVER touch 192.168.170.10
- Deploy: ./deploy/lan/build.ps1 + ./deploy/lan/up.ps1
- CRITICAL DEPLOY NOTE: `docker compose --force-recreate` does NOT reliably pick up
  new images on this stack. Use: docker rm -f afrakala-lan-web && docker compose
  --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d web
- Verify deploy with BOTH: APP_BUILD_TIME (must be recent) AND grep for a known
  new symbol in the container. APP_GIT_SHA alone is NOT trustworthy.
- Existing RPC: person_create_inline(p_display_name, p_kind, p_identifiers,
  p_context_kind, p_context_ref_table, p_visibility_scope) — atomic person +
  legacy row + context link, returns {person_id, legacy_id, context_kind}
- e2e suite: e2e/persons/ (registered in playwright.config.ts testMatch)
- typecheck baseline: exactly 70 errors (do not exceed)

GLOBAL CONSTRAINTS:
- Output terminal in English (LANG=en_US.UTF-8)
- auto-accept is ON — do NOT stop to ask; proceed through all steps
- Persian UI strings stay Persian (CLAUDE.md rule 12)
- All migrations reversible (ship an XXX-down.sql, kept OUT of migrations/)
- SQL with Persian text: use docker cp + psql -f, never pipe
- Before rebuilding any function: pg_get_functiondef first, diff, confirm
- Read-only discovery against afrakala-lan-db; writes only via migrations
- Commit at end of each checkpoint with real SHAs recorded in PROGRESS.md

═══════════════════════════════════════════════════════════════════════════════
STEP 0: Discovery (read-only) + Full Baseline
═══════════════════════════════════════════════════════════════════════════════

Before any change, establish the current truth:

1. Read PROGRESS.md and last 5 git commits.

2. Read these files completely and report what each does on save:
   - src/shared/components/SupplierForm.tsx (or wherever it lives — grep)
   - src/shared/components/CustomerForm.tsx
   - src/shared/components/SupplierReferralModal.tsx
   - src/lib/customers/functions.ts
   - src/lib/suppliers/functions.ts (if exists)
   - src/components/persons/PersonForm.tsx (for the a11y fix)
   - src/components/persons/PersonModal.tsx (reference: it does labels correctly)

3. For each creation path, report EXACTLY how it inserts:
   grep -rn "insert.*suppliers\|insert.*customers\|createSupplier\|createCustomer\|\.from('suppliers')\|\.from('customers')" src/

4. Count current NULL person_id rows:
   $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -c "
   SELECT 'suppliers' t, COUNT(*) total, COUNT(*) FILTER (WHERE person_id IS NULL) nulls FROM public.suppliers
   UNION ALL
   SELECT 'customers', COUNT(*), COUNT(*) FILTER (WHERE person_id IS NULL) FROM public.customers;"
   
   Record these numbers. They are the backfill target for Step 3.

5. Baseline checks:
   npx tsc --noEmit 2>&1 | grep -cE "error TS"   (expect 70)
   npm run build                                   (expect pass)
   npx playwright test e2e/persons/ --reporter=list  (expect 8/8)

REPORT before proceeding: a table of every write path, whether it sets person_id,
and the current NULL counts. Then continue automatically.

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 6.1: Route SupplierForm through person_create_inline
═══════════════════════════════════════════════════════════════════════════════

GOAL: SupplierForm creates a person + supplier atomically, never a bare supplier.

1. Modify SupplierForm.tsx so its submit calls person_create_inline with
   context_kind='supplier', context_ref_table='suppliers', instead of a direct
   suppliers insert. Preserve every existing field the form collects (name,
   phone, settlement terms, etc.) — map name→display_name, phone→identifier
   (kind mobile_e164), and keep supplier-specific fields on the created row.

2. If SupplierForm collects supplier-specific data that person_create_inline does
   not currently persist (settlement_terms, rating, procurement_owner), do NOT
   silently drop it. Either:
   a) extend person_create_inline to accept an optional p_supplier_fields jsonb
      that it applies to the suppliers row it creates, OR
   b) do a follow-up UPDATE on the returned legacy_id inside the same handler.
   Choose (a) if the RPC is the single source of truth; report which you picked.

3. Keep the existing Persian success/error toasts and validation messages.

TESTS FOR 6.1 (run before moving on):
- npx tsc --noEmit → still 70
- npx eslint on touched files → 0 errors
- SQL probe: create a supplier via the RPC path in a ROLLBACK transaction, assert
  the suppliers row has a non-null person_id and a matching person_context_links row.
- npm run build → pass

Commit 6.1: "Phase 6.1: SupplierForm routes through person_create_inline"
Record SHA in PROGRESS.md.

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 6.2: Route CustomerForm + SupplierReferralModal through the RPC
═══════════════════════════════════════════════════════════════════════════════

GOAL: The remaining two creation paths also go through person_create_inline.

1. CustomerForm.tsx → person_create_inline with context_kind='customer',
   context_ref_table='customers'. Same field-preservation rules as 6.1
   (credit_limit, assigned_salesperson, sales_terms must survive).

2. SupplierReferralModal.tsx → same treatment as SupplierForm (context_kind
   ='supplier'). This is the component that most likely created the stray "api"
   supplier — confirm by reading it.

3. lib/customers/functions.ts and lib/suppliers/functions.ts → any exported
   create* helper that inserts directly must be redirected to the RPC or marked
   @deprecated and left unused (per rule 15) if nothing calls it anymore. Report
   which functions you changed vs deprecated.

TESTS FOR 6.2:
- npx tsc --noEmit → 70
- npx eslint touched files → 0
- SQL probe (ROLLBACK): create a customer via the new path, assert customers row
  has person_id + context link. Repeat for SupplierReferralModal path.
- npm run build → pass

Commit 6.2: "Phase 6.2: CustomerForm + SupplierReferralModal route through RPC"
Record SHA.

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 6.3: Backfill remaining NULLs + make person_id NOT NULL
═══════════════════════════════════════════════════════════════════════════════

GOAL: No supplier/customer without a person; enforce it at the schema level.

⚠️ This is partly irreversible (NOT NULL constraint). Take a backup first.

1. BACKUP:
   $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
   docker exec -e PGPASSWORD=$pw afrakala-lan-db pg_dump -U supabase_admin -d afrakala \
     | gzip > D:\backups\afrakala\pre_phase6_3_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql.gz
   Verify file exists and >1MB.

2. Write migration 232 (supabase/migrations/2026MMDD<HHmmss>_232_person_id_not_null.sql):
   - Backfill any remaining NULL person_id rows (suppliers + customers) by calling
     the same identity-matching logic person_import_batch uses: match on normalized
     mobile if present, else create a fresh person from the row's name.
   - This will absorb the "api" supplier and the محمدرضاین duplicate case per your
     earlier decision (create separate person, record in merge queue — DO NOT
     auto-merge).
   - VERIFY zero NULLs remain (RAISE EXCEPTION if any).
   - ALTER COLUMN person_id SET NOT NULL on both suppliers and customers.
   - Add deprecation comments if not already present.

3. Ship 232-down.sql (drops NOT NULL only; keeps data) in docs/verification/.

TESTS FOR 6.3:
- DRY-RUN migration 232 inside a single ROLLBACK transaction first: assert final
  NULL count = 0, assert NOT NULL constraint would hold. Report leftover count.
- Apply for real with --single-transaction and ON_ERROR_STOP.
- Post-apply verify:
  SELECT COUNT(*) FILTER (WHERE person_id IS NULL) FROM suppliers;  → 0
  SELECT COUNT(*) FILTER (WHERE person_id IS NULL) FROM customers;  → 0
  SELECT COUNT(*) FROM persons;  (report new total)
- npx tsc --noEmit → 70; npm run build → pass

Commit 6.3: "Phase 6.3: backfill + person_id NOT NULL (migration 232)"
Record SHA + new persons count in PROGRESS.md.

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 6.4: Fix UI bug #4 — /persons/create identifier section
═══════════════════════════════════════════════════════════════════════════════

GOAL: The create page supports identifiers in one flow (no create→edit detour).

1. Add the identifiers section to the person CREATE page so a user can add a
   mobile/national-id at creation time, matching what the edit page offers.
   Reuse the existing identifiers component — do NOT build a second one.

2. On submit, pass identifiers into person_create_full (which already accepts
   p_identifiers) so they are created + normalized in the same transaction.

TESTS FOR 6.4:
- npx tsc --noEmit → 70; eslint → 0; build → pass
- (e2e covered at end)

Commit 6.4: "Phase 6.4: identifier section on person create page"

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 6.5: Fix UI bug #5 — PersonForm label accessibility
═══════════════════════════════════════════════════════════════════════════════

GOAL: Labels wired to inputs (htmlFor/id), matching PersonModal.

1. In PersonForm.tsx, give each <Input>/<Select> an id and each <Label> a matching
   htmlFor. Use the same convention PersonModal uses (e.g. htmlFor="pf-name" /
   id="pf-name"). This is a pure a11y fix — no behavior change.

TESTS FOR 6.5:
- npx tsc --noEmit → 70; eslint → 0; build → pass
- After this, the e2e sibling-selector workarounds can use getByLabel; update the
  two specs (person-create-normalize, person-edit) to use getByLabel now that it
  resolves, so the tests assert the a11y wiring too.

Commit 6.5: "Phase 6.5: wire PersonForm labels to inputs (a11y)"

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 6.6: Fix UI bug #2 — quote detail reachable from list
═══════════════════════════════════════════════════════════════════════════════

GOAL: Users can open a quote's detail page by clicking the row.

1. On /sales/quotes, make the quote number (or row) a link to
   /sales/quotes/{id}. Keep the five existing status-action buttons working —
   only add navigation on the number/row, don't hijack the action buttons.
   Confirm the detail route (/sales/quotes/{id}) actually renders (Test 1 already
   proved it does).

TESTS FOR 6.6:
- tsc 70 / eslint 0 / build pass
- (e2e at end verifies the click path)

Commit 6.6: "Phase 6.6: link quotes list rows to quote detail"

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 6.7: Investigate UI bug #3 — /sales/quotes/new → login redirect
═══════════════════════════════════════════════════════════════════════════════

GOAL: Understand and, if safe, fix the redirect of an authenticated admin.

1. This is unrelated to persons and may be a route-guard misconfig. INVESTIGATE
   first and report root cause before changing anything:
   - Read the route file for /sales/quotes/new and its guard.
   - Compare against /purchases/create which does NOT redirect.
2. If the cause is a clear, low-risk guard bug, fix it. If it touches auth/session
   logic broadly, STOP and report rather than risk a wider regression — this one
   is allowed to end in a report instead of a fix.

TESTS FOR 6.7:
- If fixed: tsc 70 / eslint 0 / build pass, and a note on what changed.
- If deferred: a clear written root-cause + recommended fix.

Commit 6.7 (only if changed): "Phase 6.7: fix /sales/quotes/new auth redirect"

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 6.8: Merge queue surfacing (duplicate persons)
═══════════════════════════════════════════════════════════════════════════════

GOAL: The known duplicate (محمدرضاین: supplier-person + customer-person) and any
future ones are visible for manual merge — NOT auto-merged.

1. Confirm whether a merge-queue table already exists (from Phase 4). If yes,
   report its shape. If no, create a lightweight person_merge_candidates table
   (person_id_a, person_id_b, reason, status, created_at) via migration 233.
2. Populate it with the known duplicate pair (do not merge them).
3. This checkpoint is DATA + SCHEMA only — a full merge UI is out of scope; just
   make the candidates queryable. Report the rows.

TESTS FOR 6.8:
- DRY-RUN then apply migration 233 (if needed).
- Assert the duplicate pair is present, status='pending'.
- tsc 70 / build pass.

Commit 6.8: "Phase 6.8: person merge-candidates queue (migration 233)"

═══════════════════════════════════════════════════════════════════════════════
CHECKPOINT 6.9: Build, Deploy, Full e2e Regression
═══════════════════════════════════════════════════════════════════════════════

GOAL: Everything live and proven end-to-end.

1. BUILD:
   npx tsc --noEmit   (70)
   npx eslint (all touched files)  (0 errors)
   bun run build   (pass)

2. DEPLOY (use the reliable path — force-recreate is NOT enough):
   .\deploy\lan\build.ps1
   docker rm -f afrakala-lan-web
   docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d web
   Start-Sleep -Seconds 15

3. VERIFY DEPLOY (both signals, not just SHA):
   docker exec afrakala-lan-web printenv APP_BUILD_TIME   (must be the fresh build)
   docker exec afrakala-lan-web sh -c "grep -rl 'person_merge_candidates\|pf-name' /app 2>/dev/null | head -3"  (new symbols present)
   Invoke-WebRequest -Uri "http://192.168.170.8:3100/api/version" -UseBasicParsing | Select -ExpandProperty Content
   docker ps --filter name=afrakala-lan-web --format "{{.Status}}"   (Up healthy)

4. DB OBJECT VERIFICATION (all = 1 / expected):
   $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -c "
   SELECT
     (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='suppliers' AND column_name='person_id' AND is_nullable='NO') supplier_notnull,
     (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='customers' AND column_name='person_id' AND is_nullable='NO') customer_notnull,
     (SELECT COUNT(*) FILTER (WHERE person_id IS NULL) FROM suppliers) supplier_nulls,
     (SELECT COUNT(*) FILTER (WHERE person_id IS NULL) FROM customers) customer_nulls,
     (SELECT COUNT(*) FROM pg_proc WHERE proname='person_create_inline') inline_rpc;"
   Expected: supplier_notnull=1, customer_notnull=1, supplier_nulls=0, customer_nulls=0, inline_rpc=1

5. FULL E2E REGRESSION (this is the phase-end gate):
   npx playwright test e2e/persons/ --reporter=list
   Expected: all green (8/8, including the now-real auto-select assertion).
   
   THEN add + run NEW e2e specs for the Phase 6 work:
   
   a) e2e/persons/supplier-form-person.spec.ts
      - Navigate to the SupplierForm (wherever it is; discover the route)
      - Create a supplier with name + mobile
      - Assert (via DB probe) the created suppliers row has non-null person_id
        and a person_context_links row
      - Cleanup in afterAll, assert zero leftovers
   
   b) e2e/persons/customer-form-person.spec.ts
      - Same for CustomerForm: created customer has person_id + context link
      - Cleanup + zero leftovers
   
   c) e2e/persons/person-create-with-identifier.spec.ts
      - On /persons/create, fill name AND add a mobile identifier in the SAME
        page (bug #4 fix), submit
      - Assert person + normalized identifier (+98…) created in one flow
      - Use getByLabel now that labels are wired (bug #5 fix)
      - Cleanup + zero leftovers
   
   d) e2e/persons/quote-list-link.spec.ts
      - On /sales/quotes, CLICK the first quote's number/row (bug #6 fix)
      - Assert navigation to /sales/quotes/{id}
      - Assert customer name links to /persons/{uuid}
   
   Run the whole persons suite again — everything must be green:
   npx playwright test e2e/persons/ --reporter=list

6. DATA HYGIENE:
   - All new data-creating tests clean up in afterAll and assert zero leftovers.
   - Verify persons count returns to its post-6.3 baseline.
   - person_fk_drift_report() → no drift.

═══════════════════════════════════════════════════════════════════════════════
FINAL: Commit + PROGRESS + Report
═══════════════════════════════════════════════════════════════════════════════

1. Commit remaining Phase 6 UI + e2e work:
   "Phase 6.9: deploy + full e2e regression (Phase 6 gaps closed)"
2. Update PROGRESS.md with all Phase 6 SHAs, new persons count, and the NOT NULL
   milestone.
3. FINAL REPORT — a single table:

   | Item | Before | After | Status |
   |------|--------|-------|--------|
   | suppliers.person_id NULLs | ? | 0 | ✅ |
   | customers.person_id NULLs | ? | 0 | ✅ |
   | suppliers.person_id NOT NULL | no | yes | ✅ |
   | customers.person_id NOT NULL | no | yes | ✅ |
   | SupplierForm → RPC | no | yes | ✅ |
   | CustomerForm → RPC | no | yes | ✅ |
   | SupplierReferralModal → RPC | no | yes | ✅ |
   | /persons/create identifiers | no | yes | ✅ |
   | PersonForm a11y labels | no | yes | ✅ |
   | Quote list → detail link | no | yes | ✅ |
   | /sales/quotes/new redirect | bug | fixed/deferred | ? |
   | Merge candidates queue | no | yes | ✅ |
   | e2e persons suite | 8 | 12+ | ✅ all green |

   State clearly:
   - Is EVERY person/supplier/customer creation now going through person_create_inline? YES/NO
   - Are the FK columns NOT NULL and enforced? YES/NO
   - Deploy verified live via APP_BUILD_TIME + symbol grep? YES/NO
   - Any remaining gaps for a future Phase 7?

REMEMBER:
- auto-accept is ON; do not stop between checkpoints.
- If a checkpoint's tests fail, FIX and re-run before advancing — do not skip.
- Persian UI strings stay Persian.
- Never touch production 192.168.170.10.
- Use docker rm -f for deploys, verify with APP_BUILD_TIME + grep.
- Report at each checkpoint, full report at the end.

START NOW with Step 0 (discovery + baseline).
