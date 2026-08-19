# Programme audit — AfraKala Live Ledger (phases 0–5 + reverse_document)

**Date:** 2026-08-19  
**Stance:** independent post-mortem. Live catalogue and real RPC calls inside `BEGIN … ROLLBACK`. Production (`192.168.170.10`) was not contacted.  
**Census after this review:** `journal_entries=4`, `journal_lines=8`, `payment_receipts=9`, `payment_vouchers=0`, `dual_documents=0` — same as at first connection. This review left the database as found.

---

## 1. The one-paragraph honest summary

The ledger **does post**. A bank receipt, a bank payment, an own-cheque payment, an endorsed cheque, and a dual document each create a balanced, posted, numbered journal entry when you call the real RPCs. Reversal exists and, for a bank receipt, removes that document from the Asan receipt export. Cheque documents are now **absent** from that export (owner T15 / 367), not listed as empty 0-toman rows. What the accountant **sees as a party’s full position is still not true**: T14 says purchases and sales do not post, so `new_balance` for a paid supplier is negative and that is by design. What they **see as cash in the bank** is inflated by a 10-billion-toman seed receipt that cannot be exported (missing Asan code). Two create paths still sit beside the new RPCs: the treasury page still inserts `payment_vouchers` with no journal (`createPaymentVoucher`), and `reverse_document` has **no UI caller**. The written programme record is **not trustworthy as a ledger of itself**: MASTER-CHECKLIST still shows phases 1 and 3 unticked; `00-progress.md`’s migration table stops at 366 while 367 is live; `schema_migrations` still ends at `20260811180000` and would skip 32 migrations on a naive phase-9 replay. Phase 6 already shipped (wizard, PR #325) after the period this audit was scoped to; task 6.7 remains blocked on OG-4. **Do not treat “Gate A PASS” as “the books a human would publish are correct.”** Treat it as “the writers we built, on the path we tested, did not quietly double-count.”

---

## 2. What has actually been built

Before this programme, `journal_entries` held one seed row; the receipt create page inserted four PostgREST rows and posted nothing; payments were a bare insert.

**Now, on the test database, you can:**

- Mint `RCP-` / `PAY-` / `DUAL-` numbers (`assign_document_number`).
- Create a **bank receipt** that posts `bank` / `customer_credit`, immediately, as `admin`/`accountant`/`manager`.
- Create a **cheque receipt** that posts `cheque_receivable` / `customer_credit`.
- Create a **bank payment** and an **own-cheque payment** that post `supplier_payable` against the real payee (T13 c3 holds: not the purchase-voucher supplier-keying bug).
- **Endorse a held cheque once**; a second endorsement raises `P0001`.
- Create a **dual document** with exactly two journal lines and no fee construct (15 arguments; zero fee columns).
- **Reverse** a posted receipt, payment, or dual (`reverse_document`); manager is refused (`42501`, 365 / OG-22).
- Export journal rows through `asan_list_journal_export` classified on **stored** `doc_kind` (366), with reversals and cheques **excluded** from the standing-document filters (367 / T15), and a fourth UI menu for `purchase_payment` + `settlement`.

**You still cannot, and that is not a surprise:**

- Create a **cash** receipt or cash payment: `account_type='cash'` row count is **0**. Cash receipt raises `22023` (destination required). Cash payment from the only bank account raises `P0001` («پرداخت نقدی باید از صندوق انجام شود»). **Impossible by design until a صندوق exists.**
- Attach files on create (`p_attachment_ids` → `0A000`).
- Look up one mobile in three formats (OG-4). The wizard uses exact match.
- Reverse from the browser (`src/` has **zero** `reverse_document` calls).
- Post a purchase or a sale (T14). Party “balances” are money-moved, not what is owed.
- Trust `schema_migrations` for phase 9.

---

## 3. Task-by-task (phases 0–5)

Status: **delivered** / **partially delivered** / **recorded as done but not delivered** / **not applicable**.  
Checklist ticks in `MASTER-CHECKLIST.md` are **not** used as evidence. Live objects are.

| Task | Required | Live? | Status |
|---|---|---|---|
| **0.1** `ground-truth.md` | File | Yes | **delivered** |
| **0.2** A1–A4 | `ledger-decisions.md` | Yes | **delivered** |
| **0.3** `decisions.md`, `deferred.md` | Files | Yes | **delivered** |
| **0.4** checklist + templates | Files | Yes | **delivered** |
| **0.5** OG-1 | Line `OG-1: CONFIRMED` | Present, dated 2026-08-18. Checklist still `[ ]` | **delivered** (checkbox stale) |
| **1.1** Drop dead posting | `post_receipt_journal` count 0; `trg_payment_receipts_post_journal` 0 | **0 / 0**. Function `trg_post_receipt_on_approve` **still exists**, **0** triggers fire it (OG-8 residue) | **delivered** (named objects). Orphan function remains |
| **1.2** `document_numbers` + `assign_document_number` | Table + idempotent mint | Table exists. Same `source_id` twice → `t` (this review) | **delivered** |
| **1.3** `require_asan_code` | P0001 if no code | Function exists, **SECURITY INVOKER** (346 closed Gate A M1) | **delivered** |
| **1.4** cheque kinds + `doc_kind` | Null count 0 | `doc_kind IS NULL` = **0**. `validate_journal_line_ref` still **6** ARRAY maps | **delivered** |
| **1.5** `document_attachments` | RLS + 3 policies | `relrowsecurity=t`, **3** policies, **0** rows | **delivered** (table unused by create RPCs) |
| **1.6** immutability | UPDATE posted → P0001 | Confirmed this review | **delivered** |
| **1.7** `ledger-documents` seed | All roles | **7** roles; manager `can_view/can_create = t` (352) | **delivered** |
| **2.1** contract `create_receipt` | `rpc-contracts.md` | Present; 23505 **corrected** (not success) | **delivered** |
| **2.2–2.4** create + post receipt | RPC + balanced posted | Live 14-arg function. Bank probe: `receipt` 201000/201000 | **delivered** |
| **2.3** Asan precondition | P0001, zero rows | Not re-probed this session on a no-code customer; seed export historically blocked. **Unverified here** for a fresh call | **delivered** (object exists; this session did not re-raise it) |
| **2.5** cash mint tracking | Cash receipt without tracking | **Cannot run:** no cash box. Destination required `22023` | **partially delivered** — code exists; untestable on this DB |
| **2.6** cheque debit `cheque_receivable` | Line kind | Confirmed 202000 debit | **delivered** |
| **2.7** links atomic | Failed link → 0 receipts | **Not re-probed this session** | **unverified** (claimed in phase-2 progress) |
| **2.8** role gate | sales 42501 | Sales user `6923d664-…` → `42501` | **delivered** |
| **3.1–3.9** payments | RPC, kinds, endorsement, grants | All objects live. Checklist still `[ ]` for every 3.x | **delivered** (ticks lie) |
| **3.4** debit `supplier_payable` | Checklist wording | Bank/own-cheque: `supplier_payable` debit. Endorsed: `cheque_receivable` credit (3.8), not bank | **delivered** |
| **3.6** cash payment mint | Internal number | Refused without صندوق (`P0001`) | **partially delivered** — same as 2.5 |
| **3.8** endorsement once | Second raise | First OK; second `P0001` | **delivered** (356) |
| Sign convention in 3 | Checklist said invert `person_settlement_position` | Phase 3 **refused**; Gate A endorsed. T14 later | **not applicable** — correctly not done |
| **4.1–4.7** dual | 15-arg, two lines, record-only names | `pronargs=15`. Dual 205000, **2** lines, `third_party` export n=2. Fee columns **0** | **delivered** |
| **5.1** filter on stored `doc_kind` | No bank-sign heuristic | Live body `uses_stored=t`, `has_bank_net=f` | **delivered** |
| **5.2** cheque skipped not blocked | D8 skip-line | **367 / T15 changed the rule:** cheque documents return **0 rows** under `receipt`, not a 0-toman stub. Original 5.2 Accept is **not** what ships | **partially delivered** — owner overruled D8 for whole-document exclusion |
| **5.3** migration-294 `$chk$` | Still passes | **Not run this session** | **unverified** |
| **5.4** `invoice_ar` code | 989 | Live `asan_control_accounts`: `invoice_ar / 989`. **No 5.4 migration** (correct: already there) | **delivered** |
| **5.5** three `.xlsx` samples | Files with Persian headers | Repo `.gitignore` is `*.xlsx` (“zero xlsx files ever”). Glob of `docs/verification` → **0 xlsx**. Generator exists; committed samples **cannot** exist | **recorded as done but not delivered in git** |

Phases 1 and 3 are **complete in the catalogue** and **open in the checklist**. That is a record defect, not a missing RPC.

---

## 4. Missing, unreachable, or unwired

### Nobody asked for, but it exists

- **32 migrations (336–367)** vs a 10-task phase plan: remediations (345–353, 356–359, 362, 365, 367) were forced by Gate A. They are the programme working, not scope creep.
- **`jalali_year`**, burn triggers, `document_attachments` (0 rows), fourth Asan menu (`purchase_and_settlement`) — required by later gates, not by the original 5.1 filter list.
- **Committed residue:** `OG14-CONC` + reversal journals (343-undeletable); burned phantom number `receipt/51` / `8141b507-…`; **new** receipt `b34a2df1-…` tracking `12364`, amount **120,000,000**, journal `d9f2eda4-…` / `RCP-1405-000054`, created **2026-08-19 16:47Z** (after the wizard deploy). Census is no longer the “3 entries / 8 receipts” Gate A reports.

### Asked for, missing or hollow

- **`normalize_identifier`** (deferred.md, OG-4, task 6.7).
- **Cash box.**
- **UI for `reverse_document`.** SQL exists; `src/` does not call it.
- **Phase 5 sample workbooks in git** (5.5 vs `*.xlsx` gitignore).
- **`schema_migrations` rows for 336–367.** Newest: `20260811180000` (**523** rows). A tool that replays “what this table says is applied” **skips the entire ledger programme**.
- **Checklist ticks** for 1.x and 3.x.

### Reachable in the signature, dead in behaviour

| Thing | What happens |
|---|---|
| `p_attachment_ids` non-empty | `0A000` (all three create RPCs) |
| Fee / intermediary on dual | **Gone** (362). 15-arg only |
| Cash channel | Refused until `account_type='cash'` exists |
| `doc_kind` CHECK values `purchase_payment`, `settlement` | Written by **pre-existing** `pay_purchase_with_voucher` / settlement; **reachable from Asan UI** after 367’s fourth menu. `other` still unclassified / blocked |
| `createPaymentVoucher` | Still a **bare insert** from `/accounting/payment-vouchers`. Posts **nothing**. Parallel to `create_payment` |
| `post_receipt_accounting` | Still on the receipt **detail** page. Legacy path (D12). Wizard create bypasses it |
| Dual UI copy | `CONTROL_ACCOUNT_NOTE` for third-party still mentions «شخص واسط» and Asan code — **fee world**. Live RPC has no intermediary |

### Built but never wired (this programme’s own failure mode, tested)

| Object | SQL callers | `src/` |
|---|---|---|
| `create_receipt` / `create_payment` / `create_dual_document` | Each other / tests | **Wizard only** (`DocumentWizard.tsx` → `callLedgerRpc`) |
| `reverse_document` | Accept scripts | **none** |
| `document_attachments` | Triggers on parent delete (346) | **no insert from wizard** (0A000) |
| `assign_document_number` | The three create RPCs + reverse | none directly |
| `trg_post_receipt_on_approve` | **0 triggers** | n/a |

The insight holds for **reversal** and for **attachments**. It does **not** hold for the three create RPCs after phase 6: they are wired.

---

## 5. Does the ledger work end to end?

Invoked the **real** functions under admin JWT `1a15e8c6-…` inside `BEGIN … ROLLBACK`. Then `ROLLBACK`. Recensus matched.

| Path | Journal | Readers | Export | Reverse |
|---|---|---|---|---|
| Bank receipt 201000 | `doc_kind=receipt`, 201000=201000 | `vw_account_balances.total_in` includes it (and the **10.12 billion** already there) | `receipt` filter: **2 unblocked lines**. After reverse: **0** (367) | Returns reversal id |
| Cash receipt | — | — | — | **Impossible:** no صندوق (`22023`) |
| Cheque receipt 202000 | `cheque_receivable` / `customer_credit` | Cheque must not move bank (359): own-cheque payment left `total_out=0` | `receipt` filter for that doc: **0 rows** (T15 whole-document exclusion) | Not separately reversed this session |
| Bank payment 203000 | `payment`, balanced | `new_balance=-203000` (**T14**, not a bug) | `payment` filter: **2** lines | Reversed |
| Cash payment | — | — | — | **Impossible:** bank account is not صندوق (`P0001`) |
| Own cheque 204000 | `supplier_payable` / `cheque_payable` | `total_out` still **0** | Cheque docs excluded by 367 | Not reversed this session |
| Endorsement | First `create_payment` OK; second **P0001** | — | — | — |
| Dual 205000 | `dual`, **2** lines, names on the slip are not lines | Dual does not move the bank view | `third_party` **2** | Reversed |
| Sales create_receipt | — | — | — | **42501** |
| Manager reverse of OG14-CONC | — | — | — | **42501** (365) |
| UPDATE posted `journal_entries` | — | — | — | **P0001** (343) |

**Are the numbers a user sees correct?**

- **Posted journal of a new bank/cheque/dual/payment document:** yes, on the RPC path. Balanced. Kind stored. Counterparty is the person you paid, not a stolen supplier id.
- **Asan journal file for standing bank receipts/payments:** yes, after 367, for documents created in the probe. Reversals and cheques are **out**. That matches T15, not the original D8 skip-line story.
- **Bank “current balance” on `vw_account_balances`:** **not a number you can publish.** `total_in` ≈ **10,220,201,000** on account «12» because the July seed receipt is 10,100,000,000 Toman. That seed is still a posted `receipt`. Export historically **blocks** it (no customer Asan code). The cash view **does not**. Ledger and export disagree on whether that money “counts.”
- **Supplier `new_balance`:** negative after a payment. **Correct under T14** (no purchase credit). Wrong if a human reads it as “we overpaid.”
- **Treasury list created via `createPaymentVoucher`:** **zero journal**. The page still offers that path. Two truths: “payments post” (RPC) and “payments on this screen do not” (insert).

**Impossible by design vs broken**

| | |
|---|---|
| No cash documents | Design + missing master data |
| No attachments | Design (OG-5 / 0A000) |
| No purchase/sales in the ledger | T14 |
| Seed 10B in the cash view, blocked in Asan | **Broken alignment** of two readers, not a new writer bug |
| Wizard vs treasury insert | **Broken product surface** — two payment create paths |
| No reverse button | Unwired, not a SQL defect |

---

## 6. Every Gate A defect and its state today

Pattern named in the reports: (1) **don’t invoke the real function**; (2) **built never wired**; (3) **cash published as bank**; (4) **cheque credited twice**. Those four still describe the history. A **fifth**, not named as a cluster: **the operator record does not track the catalogue** (checklist boxes, migration table, `schema_migrations`, rollback files with inner `COMMIT`, UI strings after the SQL moved).

| ID | Sev | Claimed fix | Live today |
|---|---|---|---|
| **P1 B1** writers omit `doc_kind` | BLOCKER | 345 | **CLOSED.** `pay_purchase_with_voucher` still contains `purchase_payment` in `prosrc`. INSERT policies on `journal_entries`: SELECT + `viewer_restricted` only (no accountant INSERT) |
| **P1 M1** `require_asan_code` DEFINER | MAJOR | 346 INVOKER | **CLOSED.** `prosecdef=f` |
| **P1 M2** journal INSERT via PostgREST | MAJOR | 346 drop policies | **CLOSED** (policy list this review) |
| **P1 M3 / OG-13** manager numbering | MAJOR | 346 + 352 | **CLOSED.** manager seeded can_create |
| **P1 M4** attachment orphans | MAJOR | 346 delete on parent | **Mechanism closed**; table still empty |
| **P1 M5** no reverse | MAJOR | 363–365 | **CLOSED in SQL**; **OPEN in UI** |
| **P1 M6 / OG-10** cheque × external_party | MAJOR | 347 | **CLOSED** in mappings (6 ARRAY maps; not re-probed with an external-party cheque this session) |
| **P1 m1–m8** | MINOR | mixed | m6 orphan `trg_post_receipt_on_approve` **still present**. m5 `purchase_payment` **now exported** via 367. Others: rollback warnings / stress / record — not re-litigated |
| **P2 B1** cash in bank-deposit export | BLOCKER | 350 | **CLOSED** (not re-called `asan_list_bank_deposit_export` this session — **unverified here**; 350 is live in the catalogue as a replaced function historically) |
| **P2 M1 / OG-17** credit vs allocation | MAJOR | unanswered | **OPEN** (OG-17) |
| **P2 M2** 23505 / retry | MAJOR | contract rewrite | **CLOSED in `rpc-contracts.md`**. **OPEN in `stepper-spec.md`** (still “treat as success”) |
| **P2 M3** OG-13 remaining | MAJOR | 352 | **CLOSED** |
| **P2 M4** 50 stress receipts | MAJOR | owner cleanup SQL | **CLOSED** (0 `PHASE2_STRESS` rows) |
| **P2 M5** phantom number 51 | MAJOR | cleanup | **PARTIAL.** Row **still exists**, `burned=t`. Not a live issued number. Progress said “removed” |
| **P2 M6** unbounded dates | MAJOR | 351 | **Not re-probed** (date bounds). Object is 351 body |
| **P2 M7** down files COMMIT | MAJOR | rule from 350; 348/349 still have `BEGIN; COMMIT;` | **NOT CLOSED** for 348-down / 349-down / several phase-1 downs |
| **P2 M8** delete receipt orphans journal | MAJOR | 353 | **Not re-probed.** Trigger exists historically |
| **P2 m1–m6** | MINOR | 358 labels, contract notes | m3 English cheque kind: **superseded** by 367 exclusion + 358. Contract m4/m5/m6 largely closed in rpc-contracts |
| **P3 B1** reject-to-re-endorse double credit | BLOCKER | 356 unconditional unique | **CLOSED** for second live endorsement (`P0001`). Reject-then-re-endorse **not re-probed** (should also refuse) |
| **P3 M1 / OG-18** cheque moves cash view | MAJOR | 359 | **CLOSED** (`total_out=0` after own-cheque payment) |
| **P3 M2** English `cheque_payable` in export | MAJOR | 358 + 367 skip | **CLOSED** as user-visible block (doc not listed) |
| **P3 m2** bank stored as `other` → «سایر» | MINOR | phase 6 sub-channel | **OPEN** unless wizard now writes a real channel — **not verified** against `document_channel` of a wizard bank payment (`b34a2df1` has **empty** `document_channel`) |
| **P3 m3** negative `new_balance` | MINOR | T14 | **OPEN as UX**; **correct as ledger** |
| **P4 M1** `361-down` 18-arg no-op | MAJOR | gate refuses 15-arg | File **has the gate**. Not dry-run this session |
| **P4 m3** dual INSERT policy bypass | MINOR | D12 / phase 6 | **OPEN.** RPC is DEFINER; INSERT policy still finance |
| **OG14 M1** export ignores stored kind | MAJOR | 366 | **CLOSED** (stored_kind) |
| **OG14 M2** reverse credit from mutable customer_id | MAJOR | 365 | **Not re-probed** (UPDATE customer then reverse) |
| **OG14 M3** manager reverse | MAJOR | 365 | **CLOSED** (`42501`) |
| **OG14 m1** leftover CONC | MINOR | leave for phase 8 | **STILL THERE** |
| **P5 M1** reversal not labelled in file | MAJOR | T15 exclude both legs | **CLOSED as export membership** (receipt filter n=0 after reverse). **Not** closed as “reversal appears as a labelled reversing voucher” — it **does not appear** |
| **P5 M2** unreachable kinds | MAJOR | 367 fourth menu | **CLOSED** for `purchase_payment`/`settlement` **if** the UI is deployed. `other` still a hole |
| **P5 M3** 0-toman cheque listing | MAJOR | T15 exclude cheque docs | **CLOSED** (0 rows, not a stub) |
| **P5 M4** concatenated sample xlsx | MAJOR | generator + gitignore | **CLOSED as “don’t import that file.”** 5.5 artefacts **not in git** |
| **P5 m2** English `«other»` | MINOR | 367 Persian cheque labels | **`other` message not re-read.** Unverified |
| **P5 m3** CONTROL_ACCOUNT_NOTE | MINOR | rewrite | **PARTIAL.** Note no longer names `invoice_ar` in English; dual note still talks about واسط |
| **P5 rem m1/m2** leftover comments | MINOR | — | Not re-read |

---

## 7. Open Owner-Gates and what they block

| Gate | State | Who owes | Blocks |
|---|---|---|---|
| OG-1 A1–A4 | **CLOSED** 2026-08-18 | — | — |
| OG-2 drop dead path | **CLOSED** (336) | — | — |
| OG-3 `invoice_ar` | **CLOSED** (989 already) | — | — |
| **OG-4** phone canonical form | **OPEN** | Owner | **6.7** three-format lookup; `normalize_identifier` |
| **OG-5** HTTPS | **OPEN** | Infra | **Phase 7 OCR / uploads** |
| **OG-6** production authorised | **OPEN** | Owner | **Phase 9** |
| **OG-8** drop `trg_post_receipt_on_approve` | **OPEN** | Owner | Nothing functional (0 triggers). Loaded gun if re-attached |
| OG-9 serial reset Jalali year | **OPEN** | Owner | Numbering policy, not a writer |
| OG-10 cheque external party | **CLOSED** (347) | — | — |
| **OG-11** `post_receipt_accounting` vs immutability | **OPEN** (recorded) | Owner | Legacy post button only |
| **OG-12** module string `ledger-documents` | **OPEN** | Owner | Naming only |
| OG-13 manager create | **CLOSED** | — | — |
| OG-14 reverse | **CLOSED** in SQL (363–365) | — | UI still missing |
| **OG-15** `viewer_restricted` on new tables | **OPEN** | Owner | Defence in depth |
| OG-16 non-customer receipt | **CLOSED** by T10 | — | create_receipt still `p_customer_id` only (known narrow) |
| **OG-17** should `hold_credit` be built? | **OPEN** | Owner | Credit vs allocation double-count **model** |
| OG-18 cheque vs cash view | **CLOSED** (359) | — | — |
| OG-19 other side of payable/credit | **CLOSED** as T14 (don’t post purchases/sales) | — | Full position remains unassigned |
| OG-20 voucher delete guard | **CLOSED** (357) | — | — |
| OG-21 fee / صراف | **CLOSED** (362) | — | — |
| OG-22 manager reverse | **CLOSED** (365) | — | — |
| **OG-23** freeze posted source columns | **OPEN** | Owner | 365 M2 class (mutable party after post) |

**Deferred.md (still true):** cheque lifecycle, cheque book, accrual, dropping `receipt_type`, settlement-position historic repair, تهاتر UX, purchase/sales Asan (untouched), normalize_identifier, HTTPS, pgvector, 70 typecheck, git-history xlsx, production data repair.

---

## 8. Trustworthiness of the record

**`00-progress.md` is directionally right and locally wrong.**

- Handoff: phase 6 complete, 6.7 blocked — **matches git** (PR #325). `APP_GIT_SHA: pending deploy` is **stale**; LAN image was `477c0eda` after that merge.
- Migration **table stops at 366**. Handoff text says **32 (336–367)**. **367 is missing from the table.** That is the same class as “the down file that does not drop the live function.”
- Claims `schema_migrations` stale at `20260811180000` — **reconfirmed** (`max_version=20260811180000`, 523 rows). Phase 9 must **not** use this table as the apply list. Use `supabase/migrations/` files 336–367 plus a human checklist.
- Stress cleanup: 0 `PHASE2_STRESS` rows — **true**. Phantom 51 — **still a burned row**, not deleted.

**MASTER-CHECKLIST:** phases **1 and 3 entirely `[ ]`** while objects are live. Phase 0.5 `[ ]` while OG-1 is confirmed. An auditor who only reads ticks will conclude the foundations were never built.

**Rollback files 336–367:** every number has a `docs/verification/N-down.sql`. **They would not all “actually run” as a dry-run inside one outer transaction:**

- **Inner `BEGIN; COMMIT;` still in:** 336, 338, 341, 342, 343, 346, 348, 349 (and 367-down’s `BEGIN` is **function body**, not transaction control — that one is fine).
- **348-down / 349-down:** Gate A M7; pre-flight on 348 may refuse once cheque receipts exist.
- **361-down:** refuses while 15-arg live (intentional after P4 M1). Honest order: 362-down → 361-down → 360-down.
- **337-down / 339-down / 340-down / 344-down:** statements only; 337 must follow 338; 340 drops `require_asan_code` while create RPCs still call it.
- **This review did not execute the down chain.** Whether each file *parses* is not the same as whether it *reverses 2026-08-19 reality*.

**Contracts vs live vs UI**

| Document | Conflict |
|---|---|
| `rpc-contracts.md` | 23505 is an error; no retry. **Matches** wizard `rpc.ts` |
| `stepper-spec.md` | 23505 = success. **Stale** |
| `decisions.md` D8 | Skip cheque *lines* | **Overruled by T15 / 367** (skip documents) |
| Dual UI note | واسط / Asan | **Overruled by OG-21** |

**Committed test / user data on the test DB (phase 8 baselines):**

| Residue | Effect |
|---|---|
| Seed receipt ~10.1e9, journal `6d6b1896-…` | Dominates `vw_account_balances`; historically blocked in Asan |
| OG14-CONC 10,000 + reversal | Two extra journals; excluded from standing export (367) |
| `RCP-1405-000054` / tracking `12364` / 120e6 | **New standing bank-shaped receipt** (empty `document_channel`). Will appear in phase-8 counts unless listed as exception |
| Burned serial 51 phantom | Numbering hole; not a live doc |
| `audit_logs` ~43k | Includes stress `payment_created` kept on purpose |

---

## 9. What must happen before phases 6, 8 and 9

**Phase 6:** already merged (wizard). Remaining: **OG-4** for 6.7; do not pretend three mobile formats work. Do not start phase 7 without **OG-5**.

**Phase 8 (integrated E2E / baselines):**

1. Decide the **exception list**: seed 10B, OG14-CONC pair, `12364` / RCP-1405-000054, burned 51.
2. Create a **صندوق** or skip cash in the suite and say so.
3. Drive tests through **RPCs** (or the wizard), not `createPaymentVoucher`.
4. Answer or explicitly waive **OG-17** (hold_credit) if credit assertions are in scope.
5. Fix or waive **OG-23** if tests UPDATE posted source rows.
6. Tick MASTER-CHECKLIST to match the catalogue so phase 8 does not “discover” 1.x/3.x as undone.

**Phase 9 (production):**

1. **OG-6.**
2. **Do not trust `schema_migrations`.** Replay 336–367 from files; prove each object after apply.
3. Re-verify **B1-class** writers on production (ground-truth Q5: production catalogue unknown).
4. Owner **opens one real Asan file** (5.5 cannot be the git xlsx).
5. Owner data: Asan codes, supplier links (9.6).
6. Never ship `*-down.sql` that still `COMMIT` as a production rollback without a human wrapping the transaction.
7. Production was **not measured**. Anything about production row counts is **unverified**.

---

## 10. Self-examination

1. **What I did not check.** Migration-294 `$chk$`; `asan_list_bank_deposit_export` live; date-bound probes (351); delete-posted-receipt (353); 365 M2 (UPDATE `customer_id` then reverse); reject-then-re-endorse after 356; `person_settlement_position` arithmetic; concurrent `assign_document_number`; typecheck; every down file in reverse order; browser click-through of all wizard branches (only SQL + prior Playwright smoke); production; whether `b34a2df1` was the wizard or another client; OCR; `hold_credit` callers.

2. **Claims accepted without verifying.** Task **2.7** (atomic links). **P2 B1** bank-deposit export still excluding cash (350) — not invoked this session. **P4 M1** gate behaviour — read the file, did not `\i` it. Phase-2 **2.3** no-code customer — not a fresh raise. **5.3** 294 chk.

3. **Weakest evidence.** The **120,000,000** receipt’s origin (wizard vs leftover form vs PostgREST). Export membership of the **seed** (JWT `set_config` from a PowerShell here-string failed; I did not retry via `docker cp` for that one query). I inferred seed blocking from programme history, not from a successful `asan_list_journal_export` call in this sitting.

4. **If I am wrong, it is most likely:** (a) 350 bank-deposit export behaviour drifted and cash now leaks again; (b) `document_channel` empty on `12364` means 367’s cheque predicate misses some rows I did not think about; (c) endorsement uniqueness still has a `rejected` hole I did not hit.

5. **Expected vs found.** I expected “phases 1–5 complete, a few open OGs.” I **found** the writers are real **and** the checklist still says phase 1/3 never started, **and** `schema_migrations` still blind, **and** a new 120M posted receipt, **and** `createPaymentVoucher` still live. The random independent proof: **1.2 idempotency** `assign_document_number` same uuid twice → `t`, from this session, not copied from a progress file.

---

## 11. What I could not verify

- Production catalogue, data, or reachability.
- Whether Asan (the Windows app) accepts any file this programme emits.
- Migration 294 `$chk$` on today’s function body after 367.
- Live `asan_list_bank_deposit_export` row set.
- Fresh `require_asan_code` / `create_receipt` against a customer with no code.
- Link-insert failure atomicity (2.7).
- 351 date bounds; 353 delete guard; 365 credit-from-journal after party UPDATE.
- `361-down.sql` executed.
- Full reverse-order down chain 367→336.
- Browser creation of cash (blocked) and endorsement list UX.
- `hold_credit` / OG-17 with a new quote.
- That `APP_GIT_SHA` on LAN still equals `477c0eda` at the moment you read this (it did after phase 6 deploy; this review did not printenv again).

---

*End of audit. No code or database changes were made except this file.*
