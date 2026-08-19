# Phase 6 COMPLETE — Three-branch document wizard

**Date:** 2026-08-19  
**Branch:** `feature/phase6-wizard` from `staging@ffb34084`  
**Migrations this phase:** 0  
**Backup:** `D:\AfraKalaBackups\pre-phase6-20260819-211859.dump`

## What changed

- `docs/frontend/stepper-spec.md` — dual intermediary/fee step removed (OG-21 / 362).
- `src/components/ui/stepper.tsx` — RTL stepper, React state only.
- `src/features/ledger-wizard/` — three branches wired to `create_receipt`, `create_payment`, `create_dual_document` (15-arg, no fee).
- `/accounting/receipts/create` renders `DocumentWizard`. Roles: admin, accountant, manager.
- `src/shared/components/PaymentReceiptForm.tsx` deleted. `git grep` over `src/` is empty.
- Open proformas optional (T5). Missing-Asan-code Persian block (T3 UI half).
- Exact-match party lookup; **6.7 / OG-4 not implemented.**

## Seven self-verification steps

| # | Check | Result |
|---|---|---|
| 1 | Three branches create documents | **PASS (RPC, rolled back).** Browser create waits on LAN deploy of this commit. `phase6-accept.sql`: receipt `doc_kind=receipt` balanced 111000; payment `payment` 122000; dual `dual` 2 lines 133000. Session `ROLLBACK`. |
| 2 | No Asan-code party accepted | **PASS (UI).** Lookup status `missing_asan` shows «کد آسان برای [نام] ثبت نشده است. لطفاً ابتدا کد را ثبت کنید.» and blocks next/submit. RPC still raises P0001 if bypassed. |
| 3 | Party lookup `0912` / `912` / `+98912` | **SKIPPED — OG-4 unanswered.** Exact `value_raw` + `person_find_by_identifiers` only. |
| 4 | Cheque and cash never ask bank tracking | **PASS (UI).** Cash/cheque copy on details step; tracking input only for bank (and dual slip). Cash mint remains in SQL. |
| 5 | Endorsed cheque from a list | **PASS (UI).** Payment → cheque → چک مشتری lists held cheque receipts; fields locked. |
| 6 | No wizard `localStorage` / `sessionStorage` | **PASS.** `rg` over `src/features/ledger-wizard` and `stepper.tsx`: 0 hits. |
| 7 | Old form gone | **PASS.** `git grep PaymentReceiptForm -- src` → empty. |

## Gaps

- **OG-4** — `normalize_identifier` not built (`deferred.md`). Task 6.7 remains open.
- Playwright against the live image is **after** `deploy/lan/build.ps1` (the previous image still served the old form).
- **23505:** wizard treats it as an error (rpc-contracts M2), not success.
- Do **not** start Phase 7 until OG-5 (HTTPS).

## Recommendation

Merge, deploy, confirm `APP_GIT_SHA` equals HEAD, then run `npx playwright test e2e/phase6/`. Proceed to Phase 7 only after OG-5.
