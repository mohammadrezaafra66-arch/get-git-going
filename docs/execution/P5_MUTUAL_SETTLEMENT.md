# P5 — MUTUAL SETTLEMENT

Read `docs/execution/UNIFY_MISSION_CONTROL.md` and
`docs/asan/final-architecture-plan.md` Part 4.

Goal: build the "you owe me 10, I owe you 8, net 2" flow the owner needs several times a
week. The accounting engine can already express it; only the UI is missing.

Four phases.

---

## Phase 5.1 — Verify the ledger can express mutual settlement

Final architecture plan Part 4 claims `mutual_settlement` account_kind and
`supplier_payable` account_kind exist. Confirm both live:

1. Query the `journal_lines.account_kind` CHECK constraint. Report every allowed value.
2. Confirm `mutual_settlement` is one of them.
3. Confirm `supplier_payable` is one of them.
4. If either is missing, one migration adds it — but only after confirming the plan's
   evidence, since adding a value to a live enum is not reversible casually.
5. Write out a worked example on paper: "Person X owes us 10 (customer_credit), we owe X
   8 (supplier_payable), settlement of 2 arrives as bank deposit". Confirm the ledger can
   post it as one balanced entry with 4 lines and total debits = total credits.

**Test:**
- Construct that entry via direct SQL inside a transaction.
- Assert it posts (no constraint violation).
- Assert sum(debit) = sum(credit).
- Roll back.

Commit.

---

## Phase 5.2 — Mutual settlement calculation function

Given a person_id, compute their current receivable and payable positions.

1. Function `person_settlement_position(_person_id uuid)` returns
   `(receivable numeric, payable numeric, net numeric, direction text)`.
2. `receivable` = sum of unsettled customer_credit debits on that person (what they owe us).
3. `payable` = sum of unsettled supplier_payable credits on that person (what we owe them).
4. `net` = receivable - payable.
5. `direction`:
   - `net > 0` → `'customer_pays'` (they still owe us `net`)
   - `net < 0` → `'we_pay'` (we owe them `|net|`)
   - `net = 0` → `'balanced'`
6. SECURITY DEFINER, permissioned to accountant + admin only.
7. Read exactly what "unsettled" means from the existing customer credit calculation — do
   not redefine.

**Test:**
- Set up person A with a receivable of 10 and a payable of 8. Assert function returns
  `(10, 8, 2, 'customer_pays')`.
- Change payable to 15. Assert `(10, 15, -5, 'we_pay')`.
- Balance them. Assert `'balanced'`.
- Clean up.

Commit.

---

## Phase 5.3 — Mutual settlement UI

Add a new page: `/accounting/mutual-settlement`.

1. Route file `src/routes/_app.accounting.mutual-settlement.tsx`. Accountant + admin only.
2. Page shows a searchable list of persons with **both** a customer link and a supplier
   link, i.e. real dual-role persons. For each: name, receivable, payable, net, direction.
3. Clicking one opens a detail panel:
   - Full receivable list (which quotes/invoices)
   - Full payable list (which purchases/documents)
   - A "ثبت تسویه" button
4. The settlement form asks:
   - Direction (auto-filled from position, but editable)
   - Amount (auto-filled with `|net|`, but editable if partial)
   - Cash or bank (if bank, which account)
   - Notes
5. On submit, one journal entry is posted: debit the receivable, credit the payable, plus
   the cash/bank line for the difference. Use the composition validated in phase 5.1.
6. The entry's `source_type = 'mutual_settlement'` so it's identifiable in the export.
7. After posting, receivable and payable both drop; the position recalculates.

**Test (real browser, deployed):**
- Create a dual-role person with receivable=10, payable=8.
- Visit the page. Assert the person is listed with net=2 direction=customer_pays.
- Click settle. Complete the form with cash. Submit.
- Assert one journal entry created with correct 4 lines.
- Assert receivable and payable both now = 0.
- Assert the Asan export picks it up as a normal accounting document.
- Clean up.

Commit.

---

## Phase 5.4 — Full program verification and the final report

Same shape as the M5.2 phase of the asan program: run the whole verification pass.

1. `npm run typecheck` = 70.
2. Full e2e — compare to baseline. Every red classified `documented`, `flaky`, or `new`.
   Zero new is the gate.
3. Every new module has explicit `role_permissions` rows for every role. Prove with a
   query.
4. RLS pass with real JWTs for `viewer`, `sales`, `accountant`, `admin` against every
   table touched. Count rows.
5. Confirm zero test data survives. Query for the fixtures each phase created.
6. Clean tree. `APP_GIT_SHA = HEAD` on deployed container. All three signals.
7. Re-run the phone collision detection. Confirm it now finds any duplicates that exist.
8. Re-run the corrupted-label scan from asan M1.1. Bucket A and B must still be empty.
9. Export a real mutual settlement end to end. Open the file with openpyxl. Confirm
   headers match spec.
10. Write `docs/execution/unify-final-report.md` covering:
    - What each mission delivered, with commit SHAs
    - Every decision made autonomously, with alternatives rejected
    - What remains for the owner:
      - The 15 supplier codes (still owner-supplied)
      - Any dual-role persons the owner needs to link that weren't linked automatically
      - The legacy 300+ receipts staying as-is (owner-confirmed decision)
      - The cheque/سفته/برات gap (out of scope, future project)
    - Model gaps
    - Coverage numbers: how many persons dual-role now, how many mutual settlements
      possible, etc.
    - Final typecheck and e2e totals
11. Stop and show the report.

---

## MISSION GATE — END OF PROGRAM

All of 5.4 passes. Everything committed, deployed, all signals match. `unify-progress.md`
shows every phase complete. **Stop and hand back to the owner.** This is the one point in
the program where you do.
