# Phase 6 — Wizard front end — PROGRESS

## HANDOFF STATE

```
Phase:                6 — Wizard front end
Status:               in progress (UI complete; OG-4 lookup gap remains)
Branch:               feature/phase6-wizard
Base:                 staging @ ffb34084
Tasks:                9 of 10 (6.7 BLOCKED by OG-4 — exact-match fallback shipped)
Current task:         6.11 e2e after deploy
Blocked by:           OG-4 (6.7 three-format mobile only)
Migrations applied:   none (UI only)
REST restarted after: n/a
Backup taken:         D:\AfraKalaBackups\pre-phase6-20260819-211859.dump (16 948 056 bytes)
Typecheck:            70 / 70 baseline
Last commit:          (this branch)
PR:                   pending
```

## Pre-flight

- [x] `git fetch origin && git switch staging && git pull` → `ffb34084`
- [x] `git switch -c feature/phase6-wizard`
- [x] Backup taken and path recorded above
- [x] Rollback file: none (no migration)
- [x] `npm run typecheck` → 70 (no new errors in wizard files)

## Task log

### Task 6.1 — stepper-spec.md
```
Scope:      docs/frontend/stepper-spec.md
Verdict:    PASS
Actual:     Dual “Step 5 — intermediary (صراف)” / fee / third journal line removed.
            Replaced with OG-21/362 note: transferrer and recipient are record-only.
```

### Task 6.2 — Stepper component
```
Scope:      src/components/ui/stepper.tsx
Verdict:    PASS
Actual:     RTL step indicator; no browser storage; parent owns current step.
```

### Task 6.3 — Step 1 document type
```
Scope:      src/routes/_app.accounting.receipts.create.tsx, DocumentWizard.tsx
Verdict:    PASS
Actual:     Three buttons دریافت | پرداخت | سند دوبل. No <form>. Role gate includes manager (OG-13).
```

### Task 6.4 — Receipt branch
```
Scope:      src/features/ledger-wizard/*
Verdict:    PASS (RPC accept)
Actual:     BEGIN…ROLLBACK create_receipt bank:
            P6_R_JE | receipt | posted | debit 111000 | credit 111000
            then ROLLBACK.
```

### Task 6.5 — Payment branch
```
Verdict:    PASS (RPC accept)
Actual:     P6_P_JE | payment | posted | debit 122000 | credit 122000
            then ROLLBACK.
```

### Task 6.6 — Dual branch
```
Verdict:    PASS (RPC accept)
Actual:     15-arg create_dual_document, no fee params.
            P6_D_JE | dual | posted | n_lines 2 | debit 133000 | credit 133000
            then ROLLBACK.
```

### Task 6.7 — Party lookup / normalize_identifier
```
Verdict:    BLOCKED
Actual:     OG-4 unanswered. Exact match on value_raw plus person_find_by_identifiers.
            Three-format accept NOT claimed.
```

### Task 6.8 — Open proforma list
```
Scope:      src/features/ledger-wizard/ProformaList.tsx
Verdict:    PASS
Actual:     Optional list of accepted quotes with remaining balance. T5: accounting unchanged.
```

### Task 6.9 — Delete PaymentReceiptForm
```
Verdict:    PASS
Actual:     git grep PaymentReceiptForm over src/ → 0 hits. Only historical docs/migrations mention it.
```

### Task 6.10 — Missing Asan-code message
```
Scope:      MissingAsanMessage.tsx
Verdict:    PASS (wired)
Actual:     «کد آسان برای [نام] ثبت نشده است. لطفاً ابتدا کد را ثبت کنید.» Submission blocked (status missing_asan).
```

## Phase test

```
Command:   npm run typecheck
Expected:  70 errors
Actual:    70. Wizard paths: 0 hits.

Command:   phase6-accept.sql inside BEGIN…ROLLBACK
Expected:  three posted balanced journals then ROLLBACK
Actual:    as task 6.4–6.6. ROLLBACK observed.
```

## Contradictions found

| Expected | Found | Impact |
|---|---|---|
| stepper-spec: 23505 = success | rpc-contracts.md Gate A M2: 23505 is NOT success | Wizard follows the live contract |
| Prompt: branch from fb23f7fe | staging had moved to ffb34084 (Gate A #324) | Branched from current staging |
| OG-4 blocks all of phase 6 | Only 6.7 | Exact-match fallback; rest shipped |

## Owner-Gate

OG-4 still unanswered. 6.7 skipped. Re-raised in phase-6-COMPLETE.md.

## Exit criteria

- [x] RPC accept PASS
- [ ] Playwright against live image (needs deploy)
- [x] Typecheck 70
- [x] No migration applied-but-uncommitted
- [ ] PR merged
- [ ] APP_GIT_SHA matches HEAD
