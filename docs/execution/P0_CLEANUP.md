# P0 — CLEANUP

Read `docs/execution/UNIFY_MISSION_CONTROL.md` first. Obey every rule.

Goal: clean the workspace so P1–P5 start on solid ground. Six phases. Each ends with its own
test. Mission ends with e2e and a commit.

The owner has confirmed:
- The 4 duplicate persons the report found are test-environment garbage. Delete outright.
- The 9 test person rows from previous investigations are garbage. Delete.
- The 84 e2e purchase residue rows are garbage. Delete, including their cascades.
- The Excel with real customer data must be purged from git history via force-push.

---

## Phase 0.1 — Delete the 9 test person rows

Report `deeper-diagnostic-round-2.md` identified 9 test persons: names containing
`Test Supplier`, `PSC-XYZ`, `E2E`, or similar test markers. Investigate the exact set live:

1. Query persons with names matching test markers. Report the exact list found, with created_at.
2. For each, enumerate every FK-dependent row: `customers`, `suppliers`, `person_context_links`,
   `person_identifiers`, anything else discovered via `information_schema.referential_constraints`.
3. If any test person has a linked purchase, quote, receipt, or journal entry — stop and
   report. Test persons should not have real transactions. If any do, that is a surprise
   worth investigating before deleting.
4. Delete in dependency order, one migration.
5. Verify: zero rows match the test markers after.

**Test:** the exact query from step 1 returns zero rows. Commit.

---

## Phase 0.2 — Delete the 4 duplicate persons

Report `dual-role-person-analysis.md` found:
- 2× "مصلحی" with same phone
- 2× "ملیکا مصلحی" with same phone  
- 2× "مختار شاهمرادی" (exact duplicate)
- 2× "ارسلان تاجیک" with same phone

**All are test-environment garbage per the owner. Delete both sides of each pair.**

1. Identify each pair's exact person_ids from the report's evidence. Do not re-derive.
2. For each pair, enumerate every dependent row across all FKs.
3. If any dependent row exists with financial meaning (payment_receipts, journal_entries,
   sales_quotes, purchases), stop and report. The owner said these are test data — if the
   database says otherwise, one of us is wrong and we must know which.
4. If all clean: delete in dependency order.

**Test:** zero rows remain for any of the 8 person_ids. Commit.

---

## Phase 0.3 — Delete the 84 e2e purchase residue

Final asan report identified 84 purchases in `purchases.notes` matching the e2e marker,
now grown to ~334 across further test runs. Get the current exact count.

1. Query `purchases` for the e2e marker. Report exact count.
2. Enumerate every dependent row: `purchase_items`, `stock_movements` with matching ref,
   `journal_entries` sourced from these, `payment_receipt_links`, everything.
3. Dump all affected rows to `docs/verification/P0.3-purchase-cleanup-backup.sql` via
   `pg_dump --data-only` inside the container, then `docker cp` out. Verify non-zero size.
4. Dry-run the deletion inside `BEGIN ... ROLLBACK`. Assert final counts. Roll back.
5. Real execution: one migration, dependency order, `--single-transaction`, `ON_ERROR_STOP=1`.
   Matching `docs/verification/NNN-down.sql` that restores from backup.
6. Apply. `docker restart afrakala-lan-rest`.

**Test:** zero rows match the marker. Every dependent count matches the plan. Purchase e2e
suite still passes — if it doesn't, the cleanup broke a fixture and stops here. Commit.

---

## Phase 0.4 — Full test-baseline backup of production DB

**Important:** this is a backup of `192.168.170.8` (the LAN test server). We do not touch
`192.168.170.10` (production).

1. `pg_dump -Fc` the whole `afrakala` database inside the container.
2. `docker cp` out to `D:\backups\test-server-<YYYY-MM-DD>.dump`. Verify non-zero size.
3. Report the backup path and size in `docs/execution/unify-progress.md`.

**Test:** file exists on disk, size > 0. No further verification — this is defensive backup,
not something to restore-test. Commit the progress note only, not the dump.

---

## Phase 0.5 — Purge `payment-receipts-lines-2026-08-04.xlsx` from git history

Rule 4 of Mission Control: force-push with lease is allowed here because the owner
explicitly authorized it, this branch is not shared with other agents, and the reason (leaked
customer PII in git history) is worth the disruption.

1. Take a mirror backup:
   `git clone --mirror . D:\backups\repo-before-purge-<YYYY-MM-DD>.git`
   Verify size > 0.
2. `git log --all --full-history -- "*payment-receipts-lines-2026-08-04.xlsx"` — report every
   commit that touches it.
3. Install `git-filter-repo` if missing (`pip install git-filter-repo`). Do not use
   `git filter-branch`.
4. Rewrite history removing every occurrence of that exact filename anywhere in the tree.
5. Verify: the file appears in zero commits after rewrite. Diff HEAD's tree against pre-purge
   HEAD's tree — must be empty except the removed file. **No unrelated file may have changed.**
6. Force-push with lease: `git push --force-with-lease origin feature/navigation-modernization`.
7. `git reflog expire --expire=now --all && git gc --prune=now --aggressive` locally.

**Test:** pre-purge and post-purge commit counts differ by zero (rewrite preserves count).
The file appears in zero commits. Backup exists.

**Do not touch main, integration/*, or any production branch.** Report force-push output.

---

## Phase 0.6 — Verify phone collision detection is working

Report warned: 4 duplicate pairs were found via SQL that were not in the phone-collision queue.
Investigate why.

1. Read the collision detection function live via `pg_get_functiondef`. Report its logic.
2. Run it against the current database. Report how many collisions it produces.
3. Compare its output against a fresh manual scan (same query the report used). Report the
   diff.
4. If the function misses collisions the manual scan catches, identify the specific defect
   in the function and report it in `docs/asan/collision-detection-defect.md`. **Do not fix
   it.** That is a future phase.
5. If the function actually finds everything and the pairs simply were never added to the
   queue, note that instead — the fix is different.

**Test:** the defect report exists. Commit.

---

## MISSION GATE

1. `npm run typecheck` = exactly 70.
2. Clean tree. Everything committed.
3. Build, deploy, three signals match `HEAD`.
4. `docker restart afrakala-lan-rest`.
5. Full e2e vs baseline. Documented reds may persist. Any new red is yours.
6. Update `unify-progress.md`.
7. **Immediately proceed to `docs/execution/P1_DUAL_ROLE.md`.**
