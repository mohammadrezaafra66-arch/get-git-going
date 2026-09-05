# Asan bridge — build report

**Date:** 2026-09-04 · **Host:** `VIRA-SERVICE` (test). **Production `192.168.170.10` was never contacted.**
**Base:** `staging` @ `83daaa8f`.
**Verdict: PARTIAL.** All 18 action-plan rows are resolved — 15 done with evidence, 3 blocked with
reasons. **Nothing is merged and nothing is deployed**, because a required status check is red at
baseline and bypassing it is a permission decision, not a sequencing one.

---

## The one thing blocking completion

Four PRs are open, all `MERGEABLE`, all passing **Boundary Guard**, all blocked by **Staging Check**:

| PR | Branch | Boundary Guard | Staging Check |
|---|---|---|---|
| [#386](https://github.com/mohammadrezaafra66-arch/get-git-going/pull/386) | `feature/asan-import-enforcement` | ✅ SUCCESS | ❌ FAILURE |
| [#387](https://github.com/mohammadrezaafra66-arch/get-git-going/pull/387) | `feature/asan-export-multidoc` | ✅ SUCCESS | ❌ FAILURE |
| [#388](https://github.com/mohammadrezaafra66-arch/get-git-going/pull/388) | `feature/receipt-any-person` | ✅ SUCCESS | ❌ FAILURE |
| [#389](https://github.com/mohammadrezaafra66-arch/get-git-going/pull/389) | `feature/person-delete-and-complete` | ✅ SUCCESS | ❌ FAILURE |

The failure is the documented baseline, verified from the run log — every error is in
`_app.admin.sales-reminders.tsx` and `_app.products.index.tsx`, two of the six baseline files.
**No file any agent touched appears.** Each branch independently measured `npm run typecheck` = **70**,
the exact baseline, same six files, same per-file counts.

**Why I did not merge anyway.** `gh pr merge --admin` would disable a required check on a protected
branch. Part 5: *"Autonomy covers sequencing, never permissions. No launch flag may disable a safety
check — isolate instead."* This is the owner's call.

**What unblocks it:** merge the four PRs in the order **#386 → #387 → #388 → #389** (rationale below),
or make `Staging Check` non-required until the 70-error baseline is paid down.

---

## Action-plan reconciliation — 18 rows

`dispatched = done + blocked` → **15 + 3 = 18.** ✅

### Cluster D — dual-identity receipts

| Row | Verdict | Evidence |
|---|---|---|
| **D-1** FIX | **done (partial)** | Refusal copy rewritten: the old text asserted «دریافت فقط از مشتری ثبت می‌شود», a *policy* [U] OG-16 contradicts. Now names the condition, the files held, and the remedy. **No browser evidence is obtainable** — every person lacking a `customers` row also lacks an Asan code, so `missing_asan` fires two checks earlier. Probe is the pure decision function; red→green on 4 assertions taking HEAD's own `pickKind` body verbatim |
| **D-2** INVESTIGATE | **done, no code change** | `create_receipt` **byte-identical**, `pg_get_functiondef` md5 `e9ba2cff9db0d04693d3834dc2ee852f` both sides. **Corrects `[F4]`: 31 in-body `RAISE` + 1 delegated (`require_asan_code`) = 32 refusal paths, not 23.** Migration 414 already guarantees the mirror for every app-created person, so OG-16 largely holds today; the residual gap is fixtures inserted around `person_create_inline`. Cost table for (a)/(b) below |
| **D-3** FIX | **done** | `pickKind` walked supplier→external_party→customer and took the first hit, so every payment for the **15 dual-role people** was booked against the supplier file on ordering alone, invisibly. Now ≥2 files raises `choose_role`. Red: `Received: {"kind":"supplier",…}` where null expected. Green: 13 passed |
| **D-4** FIX | **done** | Migration **425** (`20260904160000`), file **and** ledger row, md5 verified both sides. Dead `=1`/`>1` predicates removed — unreachable under `uq_customers_person_id`/`uq_suppliers_person_id`. 2 failed → 7/7. Candidate count unchanged at 15 |
| **D-5** CONSOLIDATE | **BLOCKED** | Verified independently: `approved/posted = 22`; **`pending_review/unposted = 6`, total 242,300,000**. Only `post_receipt_accounting` can post those. **5 of the 6 use `receiver_party_id` with no bank account** — and `create_receipt` has **no** receiver-party parameter. Consolidating strands live records. Needs a data decision plus an RPC redesign |
| **D-6** INVESTIGATE | **done — premise refuted** | The brief says the line has "the wrong sign". It does not. The entry balances and debiting a payable *reduces* it — correct. **The real defect: the payable was never accrued.** Verified: exactly **1** `supplier_payable` line in the whole ledger, and **0 of 12** `payment_vouchers` name a supplier. Secondary, unreported before: `create_dual_document` hard-codes both Persian line descriptions regardless of account kind |

### Cluster A — person import lifecycle

| Row | Verdict | Evidence |
|---|---|---|
| **A-1** BUILD | **done** | Enforcement in `asan_commit_person_batch` (migration **430**), not the form — per the page's own architecture. A CHECK on `person_identifiers` cannot enforce *presence*; there is no row to check `[F15]`. Red: `Expected: 1 Received: 4`. Green with the three contract strings verbatim |
| **A-2** BUILD | **done** | Same decision point as A-1 so preview and enforcement cannot drift |
| **A-3** FIX | **done** | Identity re-resolved at write time. **Two** independent leaks, not the one in the research: cross-batch *and* intra-batch (two rows sharing an Asan code produced two persons, the second with **no identifier at all** because the old `NOT EXISTS` guard suppressed the insert). Both red→green |
| **A-4** BUILD | **done** | `person_delete` + `person_delete_blockers` + policy `persons_delete_admin` (migration **435**). Counts first, **refuses** with the breakdown. Dependencies from `pg_constraint` at call time — *not* `person_fk_drift_report` `[F18]`. `person_delete` is **SECURITY INVOKER** so RLS is the real gate; the migration aborts if any other policy admits DELETE on `persons` — verified, it is the only one. Fixes `[F20]`: a delete matching zero rows can no longer report success. 8 failed → 8 passed |
| **A-5** BUILD | **done** | Split by ownership. **(a)** `/admin/persons-cleanup`, admin-only, writing through the **existing** `createPersonIdentifier` so normalisation, validation, Asan-code propagation and audit stay shared. 4 failed → 6 passed. **(b)** measured as **already satisfied** by A-1's additive `WHERE NOT EXISTS` inserts — a re-import genuinely completes any of the 24 people holding one identifier. No change needed |
| **A-6** CONSOLIDATE | **done** | 5 files deleted, callers migrated, `person_import_batch` dropped (migration **431**). Zero remaining references shown with command + output; every residual hit is a comment naming what was retired |
| **A-7** EXTEND | **done (partial by design)** | Revert (migration **432**) revokes identifiers the batch *added* to people who already existed; persons it *created* are **counted and reported, never deleted** — the owner limited deletion to persons without history. Old behaviour preserved: discarding a staged batch is unchanged |

### Cluster B — Asan exports

| Row | Verdict | Evidence |
|---|---|---|
| **B-1** FIX | **done** | **No migration** — verified the database never had a cap (`asan_list_journal_export`'s three `LIMIT`s are all `LIMIT 1` in scalar sub-selects). 33 documents in one sheet; raw XML out of the zip: `t="s"` ×204, **zero** `t="str"`, real `sharedStrings.xml` (82 strings), sheet `Sheet1`. The four e2e assertions were **rewritten** to assert multi-document export, not deleted |
| **B-2** BUILD | **BLOCKED — already exists** | `export-purchase.ts:48-54`, `available: true`, registered at `export-registry.ts:24-25`, covered by `export-purchase.spec.ts`. Not missing — starved |
| **B-3** BUILD | **BLOCKED — already exists** | `export-sales.ts:43-49`, `available: true`, two e2e specs. Same |
| **B-4** FIX | **done** | Orphan constant deleted; `grep` over `src/` returns NONE |
| **B-5** CONSOLIDATE | **done** | Generator now extracts `JOURNAL_HEADERS` and `RIAL_PER_TOMAN` from source at run time and **throws** rather than falling back to a copy. Two real defects found while open: it wrote workbooks **without `bookSST`** (the Persian-text-loss defect) and delivered SQL by `docker cp`, broken on this host |
| **B-6** *(added Stage 0)* INVESTIGATE | **done, no code change** | «؟» is a literal placeholder, not corruption. All 287 have `supplier_id IS NULL`; **284 are `E2E%` fixtures**. Secondary, unfixed: the message says "Asan code not registered for «؟»" when the truth is "this purchase names no supplier" |

---

## Expected vs actual

| Expected by the brief | Actual |
|---|---|
| B-2/B-3 are missing exports to build | **Already built and live**; starved by missing Asan codes. Building them would have been the duplicate Part 5 forbids |
| D-6 is a wrong-signed journal line | **Sign is correct**; the payable was never accrued |
| `create_receipt` has 23 refusal conditions | **32** (31 in-body + 1 delegated) |
| `person_fk_drift_report` has 16 pairs | **15**; and it was never a dependency inventory |
| The purchase export is starved 300/303 | **16 purchases have a real supplier**; 287 are fixtures. True figure: 13 of 16 blocked |
| Part 3 assigns all rows | **D-4 and D-6 were unassigned**; the orchestrator assigned them to W |
| "9 safe persons" | **19 of 90** deletable (76 incomplete → 17 deletable). `persons` drifted 86→90 during the run |

---

## Deviations from the brief, and why

1. **`PROGRESS.md` was not written to the repo root.** That path holds the 150 KB shared Codex↔Claude
   notebook `CLAUDE.md` mandates; the instruction would have destroyed it. Mission artefacts live in
   the session scratchpad and were embedded verbatim in every dispatch, so briefs stayed self-contained.
2. **D-4 and D-6 assigned to Agent W** — Part 3's fleet definition covers only 16 of the 18 rows.
3. **Stages 2 and 3 ran in parallel with Stage 1's tail**, not strictly after. Both stated reasons for
   sequencing were resolved (Q-5 answered; no file overlap). Part 5 grants autonomy over sequencing.
4. **A-5 split by ownership.** The owner chose "(c) both", but the re-import half lives in Agent I's
   file. Rather than have two agents write one function, (b) was measured as already satisfied and
   Agent P built only the screen.
5. **Agent E deleted the `oneDocumentPerFile` field** from `AsanExportDefinition` entirely rather than
   leaving it, as `[F30]` suggested. Every export set it `false`; the field was dead. Wider blast
   radius than minimal, accepted.
6. **The full-suite Playwright baseline was abandoned.** See NOT VERIFIED.
7. **Nothing was merged.** See the blocker above.

---

## Contradictions C1–C5 — disposition

| # | Disposition |
|---|---|
| **C1** OG-16 vs the schema | **Open, by the owner's choice.** D-2 was downgraded to INVESTIGATE. `create_receipt` unchanged. Measured cost: **(a)** mirror auto-create — signature unchanged, one `INSERT … ON CONFLICT`; **(b)** re-key to `p_person_id` — touches `increase_credit`, `validate_journal_line_ref` (which hard-codes `'customer_credit' → ARRAY['customers']`), **28** reader functions, view `v_customer_credit_exposure`, **51** existing journal lines, **14** FK constraints, and trips the `person_merge` FK gate. A third option — **do nothing**, relying on migration 414 — costs zero and matches today's data |
| **C2** T9 "membership is a label" vs the schema | **Open.** Membership is still a separate entity. Drift measured again: 90 persons, 89 customers, and `person_context_links` with `context_kind='customer'` still far behind. Untouched by this mission |
| **C3** "one net balance" vs reality | **Reframed, not closed.** D-6 shows the cause is a missing *accrual*, not a wrong sign: 1 `supplier_payable` line in the ledger, 0 of 12 vouchers naming a supplier. The feature cannot work until payables exist |
| **C4** the «این شخص مشتری نیست» sighting | **Resolved.** `persons_no_customer = 0`, and D-2 explains *why* — migration 414 makes it structural, not luck. What the owner saw was almost certainly the Asan-code refusal, the same string blocking 8 of 9 sales rows |
| **C5** does Asan merge documents in one sheet | **Still `[?]`.** B-1 shipped on the owner's decision. Only the owner importing a genuine two-document file settles it. A ready file is on disk at `docs/verification/asan/phase-5-asan-all-documents.xlsx` (gitignored) |

---

## NOT VERIFIED — only the owner can settle these

- **Whether Asan accepts any file this mission produced**, and **whether it merges multiple documents
  into one voucher**. Five places in this codebase assert merging as fact; all five are our own prose.
  The owner's decision [U] is the authority, and only an import settles it.
- **The whole end-to-end demonstration (DoD item 2).** Nothing is deployed — `APP_GIT_SHA=0866cff6`,
  which is `staging`, not any branch here. None of the five outcomes has browser evidence:
  a receipt from a supplier-person · an import refused for a missing Asan code · a double import
  producing no duplicate · a multi-document export downloaded from the running app · a safe person
  deleted and an unsafe one refused. All exist as passing DB/unit-level specs; none has been clicked.
- **D-1 specifically can never get browser evidence on this data** — every person lacking a
  `customers` row also lacks an Asan code, so an earlier check fires first.
- **The Playwright whole-suite baseline (DoD item 4) is UNKNOWN.** The Stage-0 run produced 0 bytes in
  over an hour and was competing with the agents' own e2e runs on the single shared server; it was
  stopped rather than left to corrupt their results. Scoped comparison used instead. Known-good
  datapoint from earlier the same day, with the failures *proved* pre-existing: `e2e/asan/` =
  15 failed / 168 passed / 22 skipped. Agent P measured `e2e/security` = 175 passed / 7 failed,
  4 Ollama-environment and 3 `og81`.
- **Whether the 4 deletable people holding an empty `suppliers` mirror should be deletable.** Agent P
  treats an empty supplier file like an empty customer file. Narrowing to customers-only drops the
  deletable set 19 → 15 and is a one-line change. Owner's call.

## Pre-existing defects found, not fixed, not ours

- **Migration 424 is applied but unrecorded** (`20260904150000` — objects exist, no ledger row). A live
  `CLAUDE.md` rule-2b violation on `staging`. It is also why it will **not** appear in a ledger query,
  which is a trap for the next agent picking a timestamp.
- **Migration 424 created a duplicate the same day:** `bank_accounts.asan_code` (NULL, read by nothing)
  alongside `accounting_code` (= 8, 9), which is what `asan_list_bank_deposit_export` actually reads.
  Owner chose "leave it, report only".
- `e2e/persons/every-person-is-a-customer.spec.ts` is red on shared-DB fixture drift.
- `og81-migration-ledger-matches-disk` is red, naming 422 and 424 as applied-but-unrecorded plus
  ledger rows without files. Every migration this mission wrote has **both** a file and a row.

## Process finding for the next mission

Central allocation covered migration **numbers** but not **timestamp prefixes**, which agents pick
independently. Agent W's first choice collided with an already-applied prefix of Agent I's; its
`INSERT … ON CONFLICT DO NOTHING` returned 0 rows, so its own ledger row would have silently gone
unrecorded had it not checked. Allocate prefixes centrally, and verify `count = 1` after recording.
