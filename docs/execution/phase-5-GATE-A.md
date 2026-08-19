# GATE A — phase 5 Supervising Engineer review — 2026-08-19

**Reviewed:** 2026-08-19, against `staging @ aacaab1c` (PR #321 merged; migration **366**).
**Scope:** phase 5 tasks 5.1–5.5. I did not write a migration, did not alter the database, and did
not start phase 6. This file is the only deliverable.
**Method:** every object read from the live catalogue (`pg_get_functiondef`, `pg_get_constraintdef`,
`pg_proc.proacl`). Every behavioural claim tested by **invoking the real**
`asan_list_journal_export` under a simulated JWT inside `BEGIN … ROLLBACK` — never by replicating
the body. The phase's own 5.1 Accept (replicate the body / ≥1 per filter) is treated as the weakest
evidence, not the strongest. Production (`192.168.170.10`) was not contacted, not queried, not
pinged. Persian output was written with `\o` and read from a file.

**Database left byte-for-byte as found.** Census at first connection and after the last probe
connection closed is identical. `OG14-CONC` and its reversal are pre-existing and 343-undeletable;
they are accounted for, not this phase's residue.

```
dual_documents|0          journal_entries|3        journal_lines|6
payment_receipts|8        payment_vouchers|0       document_numbers|155
numbers_live|2            audit_logs|43485        public_functions|841
credit_ledger|3           OG14-CONC|1 (reversed)
=== DIFF baseline vs now ===
IDENTICAL — this review left the database as found
```

I did not remediate. I did not start phase 6.

---

## Verdict

# PASS — 0 BLOCKER, 4 MAJOR, 3 MINOR

The classifier replacement is real. Live `prosrc` has `stored_kind` and no `bank_net` / `has_external`
/ bank-sign `CASE`. Regenerating the pre-366 body inside a rolled-back transaction (366-down) put
reversal `51e00e30` back under `payment`; after ROLLBACK the 366 body is still live. `_filter='receipt'`
now returns that reversal. Dual documents filter as `third_party`. `invoice_ar` is 989 and the export
writes it. `asan_list_bank_deposit_export` still excludes the reversed OG14-CONC receipt (n=1 seed
row only). 294's `$chk$` block re-runs `CHK_OK`. Rule 13 held. ACL is DEFINER + `search_path=public`,
`anon`/`PUBLIC` absent.

That is not the same as "the accountant would get correct books." Balancing is not the test here;
meaning is. Four MAJORs sit on a function the UI already calls from `/admin/asan-export`:

1. The reversal is a receipt in the file and is **not identifiable as a reversal** in the file.
2. Three CHECK values (`purchase_payment`, `other`, `settlement`) never appear in the three menus
   the page offers.
3. A cheque receipt is listed as a **zero-toman empty document** and cannot be downloaded — not D8.
4. The only data-bearing sample workbook concatenates two journal entries; Asan will silently merge
   them under one `شماره سند`.

---

## Defects found

| # | Severity | Location | Description | Evidence | Recommendation |
|---|---|---|---|---|---|
| **M1** | MAJOR | live `asan_list_journal_export` × reversal `51e00e30` | **The reversal is not a reversal in the file.** Stored header is `سند برگشتی شمارهٔ RCP-1405-000053 بابت RCP-1405-000052`. The export prefers line `ldesc` over entry `edesc`, so the Excel/CSV lines are ordinary `واریز به حساب بانکی شرکت` / `افزایش اعتبار / کاهش بدهی مشتری` with **no «سند برگشتی»**, no original number, and the deposit sentence sitting on the **credit** of the bank (the unwind). `doc_kind` is `receipt`. An accountant opening the receipt pack sees a second receipt, not an undoing. Structurally valid; semantically the OG-14 analogue. | JWT `\o` `/tmp/ga5-export-all.txt`: original two lines carry `پیگیری OG14-CONC`; reversal two lines do not. Live `journal_entries.description` for `51e00e30` contains `سند برگشتی`. UI `doc_label` is `سند YYYY-MM-DD — uuidprefix` (function body). | Raise an Owner-Gate (see verdict below). Until then, put the reversal sentence in `line_description` when `reverses_entry_id IS NOT NULL`, and/or a Persian token the accountant cannot miss. |
| **M2** | MAJOR | classifier CTE `k` × UI `export-registry.ts` | **`purchase_payment`, `other`, and `settlement` are unreachable from the page the accountant uses.** CHECK admits `receipt, payment, dual, purchase_payment, settlement, other`. Mapping: `dual`→`third_party`; `receipt`/`payment`/`settlement` keep their names; **everything else is `unclassified`** (unless `source_type='mutual_settlement'`). The page exports only `receipt` / `payment` / `third_party` (`export-registry.ts`). `WHERE _filter = 'all' OR k.dkind = _filter` therefore drops `unclassified` from every menu. `pay_purchase_with_voucher` **writes** `'purchase_payment'` (live `prosrc`). There is no `all` or `settlement` export. A purchase paid through the existing treasury page never appears in Asan. | Inside `BEGIN…ROLLBACK` with `session_replication_role=replica`: dummy `purchase_payment` → `PP_KIND unclassified`, present only under `_filter='all'` (n=2); `receipt`/`payment`/`third_party`/`settlement` n=0. Dummy `other` → `unclassified`, `all` only. Dummy `settlement` → `SETL settlement` under `all` and `settlement` only. Live `pay_purchase_with_voucher` `writes_pp=t`. Live journals today: three `receipt` rows, zero of the missing kinds. | Map `purchase_payment` → `payment` (or add a menu). Export `settlement` or map it. Do not leave a CHECK value that the accountant can post and never see. |
| **M3** | MAJOR | skip_chq × D8 × `groupJournalRows` | **Listing the document and omitting every line is not D8.** D8: skip cheque *lines*, do not withhold the document. A two-line cheque receipt cannot omit only the cheque line without unbalancing, so 366 omits the leftover party line too, sets `blocked_reason` to the cheque-skip sentence, and returns **one row with `line_no`/`account_code`/`debit`/`credit` NULL**. `doc_debit=0`, `doc_credit=300000`. The UI takes `totalToman` from `doc_debit` (`export-journal-rows.ts:116`), so the accountant sees a receipt of **0 تومان**, `rowCount=0`, checkbox disabled. They cannot download a file. That is a third behaviour: not skip-the-line, not the old "code not registered" withhold, and not silence. | JWT `CHQ_EXPORT`: `doc_kind=receipt`, Persian blocked_reason `ردیف چک در فایل آسان نیست…`, `line_no` empty, `doc_debit=0`, `doc_credit=300000`. Rolled back. | Owner-Gate: skip (and accept a one-sided file), withhold without listing, or wait for cheque Asan codes. Do not show a 0-toman receipt. |
| **M4** | MAJOR | `docs/verification/asan/phase-5-asan-receipts.xlsx` (generated) × `research-asan-bridge.md` R7.5 | **The only sample with amounts is two documents in one sheet.** Research: Layout 3 has a single `شماره سند` for the import run; several documents in one file are **silently merged**. Production UI sets `oneDocumentPerFile: true` — that path is not this file. Checklist 5.5 / phase-9 Asan trial is this workbook: original Dr bank / Cr customer plus reversal Cr bank / Dr customer, four lines, one sheet, no document break. Importing it as the owner is told to do is not a receipt and not a reversal pair; it is one net-zero voucher. | Generator run: receipts `aoa_len=5` (header + 4 lines); r1 bank 100000 بدهکار, r3 bank 100000 بستانکار. Payments/third-party `aoa_len=1` (headers only). `research-asan-bridge.md`: "One Excel file should contain ONE document." | Emit three one-document samples, or say plainly that this file must not be imported as-is. |
| **m1** | MINOR | `docs/verification/asan/gen-phase-5-samples.mjs` | **The generator does not call the live export.** It reads committed `phase-5-receipt-lines.csv` and multiplies by 10 itself. Payments and third-party workbooks are empty sheets because the script writes `[]`, not because it asked the RPC. Headers-only files are evidence those branches were **never exercised on this database**, not evidence they work. (They do work: I called `create_payment` / `create_dual_document` and the real RPC. The generator does not prove that.) | `gen-phase-5-samples.mjs` has no RPC/`psql` import. CSV four lines = OG14-CONC pair at Toman 10000. xlsx r1 بدهکار `100000` (= ×10). | Drive the generator from `asan_list_journal_export` or stop calling the xlsx an export proof. |
| **m2** | MINOR | live function blocked_reason for `other` | **English identifier inside a Persian message** — the defect that shipped in phases 2 and 3. `نوع حساب «other» هنوز تعریف نشده است و کد آسان ندارد`. No live `other` row; dummy in ROLLBACK hit it. Cheque-skip and missing-code messages are Persian. | `ENGLISH_IN_BLOCK other_in_persian_msg=t`. `OTHER_BR` as quoted. | Replace `«other»` with a Persian name, as 358 did for cheque kinds. |
| **m3** | MINOR | `src/lib/asan/export-journal.ts` `CONTROL_ACCOUNT_NOTE` | **The page still tells the accountant that `invoice_ar` and `other` block because their Asan codes are unannounced.** 5.4 is already 989; I exported a dummy `invoice_ar` line as code **989**, unblocked. The note was not in 366's scope (rule 13), so this is residue the phase claimed closed. English `invoice_ar` / `other` in a Persian UI string. | Note at `export-journal.ts:69-71`. Dummy IAR: `account_code=989`, `blocked_reason` empty, `party_name=حساب کنترلی دریافتنی (جمع بدهکاران)`. | Rewrite the note. `invoice_ar` is live. Keep `other` / `clearing` as the actual blocks. |

**Count: 0 BLOCKER, 4 MAJOR, 3 MINOR.**

---

## Verified-correct

| Check | Live result |
|---|---|
| Heuristic gone | `HEURISTIC bank_net=f has_external=f bank_sign_case=f stored_kind=t dual_branch=t`. No dead CTE left beside the new CASE. |
| 366 vs 366-down | Inside txn, `\i 366-down.sql` then real RPC: reversal `51e00e30` **payment**; `DOWN_RCPT_N n=4 docs=2`; `DOWN_PAY_N n=2 docs=1`. After ROLLBACK: `has_stored_kind=t`. Matches the phase's before/after; I regenerated it. |
| After 366, receipt filter | 6 lines / 3 docs including reversal. Payment 0, third_party 0, settlement 0 on this database. |
| Dual → third_party (C-d / C-e) | `create_dual_document` in ROLLBACK: stored `dual`, exported `third_party`, `DUAL_TP n=2`, `DUAL_RCPT n=0`. No bank line required. |
| create_payment → payment (C10 / C7) | ROLLBACK: stored `payment`, `PAY_IN_PAYMENT n=2`, `PAY_IN_RECEIPT n=0`. |
| `invoice_ar` | `asan_control_accounts`: only row `invoice_ar / 989 / حساب کنترلی دریافتنی (جمع بدهکاران)`. Dummy line used 989. Function ELSE branch reads that table. No 5.4 migration — correct; writing a no-op would have been worse. |
| 294 `$chk$` re-run | `NOTICE: CHK n_fn=1` `CHK no_ascii_q=t` `CHK kinds invoice_ar=t clearing=t other=t` `CHK balance=t` `CHK one_side=1` `CHK_OK`. |
| Security | `prosecdef=t` `search_path=public`. ACL `{postgres=X/supabase_admin,supabase_admin=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}`. **No `anon`, no PUBLIC.** 366's `REVOKE … FROM PUBLIC, anon` is the live posture (phase-2 Gate A found a historical anon grant on this name; it is not here now). Manager `e534b94d-…` → `42501` `اجازهٔ خروجی گرفتن از اسناد حسابداری را ندارید`. |
| `366-down.sql` | `CREATE OR REPLACE` same `(date, date, text)`. No `BEGIN`/`COMMIT`. Does **not** name a signature a later migration could stale. 294-down `DROP FUNCTION IF EXISTS asan_list_journal_export(date, date, text)` remains valid. |
| Bank-deposit export (phase 2 B1 / 350) | 366 did not replace it. Live body still has `reversed_at`. JWT `asan_list_bank_deposit_export('2026-07-01','2026-08-31')` → **1 row**, seed `fd8194a5-…` 2026-07-25, blocked (payer Asan code). OG14-CONC **absent**. |
| Callers | SQL `prosrc` match besides itself: `create_receipt` (comment, not a call). `src/`: `export-journal.ts` → registry → `/admin/asan-export`. Registry still has receipts / payments / third_party / bank_deposits. |
| T14 figures | Journal headers `کد حساب / کد کالا / شرح / تعداد / بدهکار / بستانکار` — no «مانده». UI column is `مبلغ (تومان)` / footer `مجموع مبلغ (ریال)` over **document debit**, a movement, not a party position. Dummy `invoice_ar` uses Asan's control-account *name* (`جمع بدهکاران`) as `party_name`; that is a title, not a summed debt. Line text «کاهش بدهی مشتری» is pre-existing journal description, not a new summary column. |
| ×10 / Rial | Live RPC returns Toman `10000`. Generator ×10 → `100000`. UI `tomanStringToRial` is ×10 (`amounts.ts`, owner CURRENCY UNIT). Research R8 was **UNKNOWN** on Asan's unit; the owner later locked Rial. Reference extract is persons/products, not journal amounts — it does not itself prove the unit. |
| Rule 13 | `git diff --name-only 42dd7f4c aacaab1c` is exactly the ten phase-5 paths (366, 366-down, progress/checklist/contracts, generator, CSV, two export txts). No `src/` edit. |
| Cheque skip vs old English withhold | Blocked reason is Persian and names the cheque skip, not `code not registered`. 5.2 Accept as written holds; D8 as written does not (M3). |
| Seed receipt | Still blocked: `کد حساب آسان برای «مشتری آزمایشی 17» ثبت نشده است`. Correctly not in the sample xlsx. |

---

## The reversal-visibility decision

**Should have been an Owner-Gate.** Same shape as phase 4's OG-21: the brief said if the evidence does
not settle how reversals appear, raise a gate and continue. Asan research has **no reversal document
type**. D11 says leave an audit trail an accountant can follow. Those two sentences do not pick an
export shape. The phase picked "emit both under stored kind" and shipped it.

**On the merits: emit-both is the less-wrong arithmetic; it is the wrong meaning without a mark.**

From `research-asan-bridge.md`, not from ledger folklore:

- One `journal_entries` row = one Asan document = one `شماره سند`.
- There is no Asan "reversal" layout. Two files with swapped بدهکار/بستانکار on the same account
  codes will **net in the accounts** if both are imported as separate vouchers.
- They will **not** net if the accountant imports only the original (the one that still looks like a
  deposit). They will **merge** if stuffed into one file (M4).

I did not observe double-count from importing both as separate documents: original Dr 8 / Cr 1125623
10000 Toman, reversal Cr 8 / Dr 1125623 10000 Toman. Net zero. That is not "the receipt filter is
deposits that still stand." The progress file says that; the file the accountant downloads does not.

If they filter receipts for a month they see a pair: one labelled like a bank deposit, one labelled
like a bank deposit's lines with the signs flipped and the tracking number gone. They will not
conclude "this one undoes that one" from the file. That is the failure mode this review was told to
find.

---

## Would an accountant importing these files end up with correct books?

**Not as a general statement, and nothing here proves Asan accepts the files.**

For the documents that exist on this database, if they use **the page** (`oneDocumentPerFile`),
export every unblocked receipt, and import **both** OG14-CONC files as two vouchers, the two
accounts net. That is arithmetically the D11 trail.

They will also conclude, falsely, that August contained two ordinary receipts. The second file does
not say it is a reversal (M1). If they import only the original, the bank is overstated by 10,000
Toman in Asan forever.

They will not import cheque receipts at all (M3). They will not import `purchase_payment` or
`settlement` because those never appear in the three menus (M2). There are none of those journals
live today; the first `pay_purchase_with_voucher` after this phase is a silent miss.

If they import the **sample** receipts workbook as one file, Asan merges original and reversal under
one `شماره سند` (M4). That is not the books.

T14 is held for labelled totals. It is not a licence to call the receipt pack "what we took in."

---

## Inherited inputs the phase claims closed

| Item | Phase claim | This review |
|---|---|---|
| OG-14 Gate A M1 | Classifier now reads stored `doc_kind`; both legs under `receipt`. | **Classifier: CLOSED.** Measured: stored pair `receipt`/`receipt`; export pair `receipt`/`receipt`; 366-down puts the reversal back on `payment`. **Meaning in the file: NOT closed** (M1). |
| Phase 4 C-d | Dual labelled / filtered `third_party`. | **CLOSED.** Real `create_dual_document` + real RPC. |
| Phase 4 C-e | Stored `dual` does not need a bank line. | **CLOSED.** Dual export had no bank line; still `third_party`. |
| Phase 3 C10 | External-party / cheque payment is `payment`. | **CLOSED for `create_payment`.** Cheque payment then hits 5.2 skip (M3). **`purchase_payment` is not C10 and is not mapped** (M2). |
| Phase 2 C7 | Same root cause as the bank-sign heuristic. | **CLOSED.** Heuristic absent from live body. |
| Phase 3 «؟» customer payee | Already 359. | Not re-opened. Join still in 366 body. |

## Contradictions the phase recorded

| Phase contradiction | Verdict |
|---|---|
| ground-truth `journal_entries` = 1; found 3 | **Confirmed.** Seed + OG14-CONC pair. 343. Accounted. |
| T13: T9 resolved before phase 5; T9 still open | **Confirmed.** Export does not present a party total (T14). Still an open identity decision, not a phase-5 patch. |
| 5.1 Accept ≥1 per filter on live DB; payment and third_party empty | **Confirmed on live data.** Proved inside ROLLBACK with the **real** function after `create_payment` / `create_dual_document`, not by replicating the body. Empty live filters are not a classifier miss. They are also why the sample workbooks for those branches prove nothing (m1). |

---

## Readers 366 changes / does not change

Enumerated from the catalogue and `src/`:

| Reader | 366 changes what it receives? |
|---|---|
| `asan_list_journal_export` itself | **Yes** — this is the object. |
| `src/lib/asan/export-journal.ts` / `export-journal-rows.ts` / `export-registry.ts` / `/admin/asan-export` | Same RPC, different `doc_kind` values. Registry not edited. Rows builder unchanged. |
| `asan_list_bank_deposit_export` | **No.** Still `reversed_at`; OG14-CONC absent; seed still listed. |
| `create_receipt` | Comment only in `prosrc`. Behaviour unchanged. |
| No other `pg_proc` calls the export. | |

---

## What I could not verify

- **Nothing here proves Asan accepts these files.** Only the owner opening one in Asan can. Research
  describes Layout 3 and the silent merge; I did not run Asan. The unit (Rial) is an owner lock plus
  ×10 in our code, not a measurement of an Asan import.
- **Whether importing two separate UI files actually nets in a live Asan company file.** The
  research mapping says it should; I did not import.
- **`pay_purchase_with_voucher` end-to-end** on a real purchase row. I read that it writes
  `purchase_payment` and proved that kind is `unclassified` / `all`-only. I did not call the RPC
  (101 purchases; a real pay would need a chosen purchase even inside ROLLBACK).
- **Clearing lines** (still blocked by design; no dummy).
- **Production.** Not contacted.
- Typecheck. Not re-run; D14 is 70.

---

## Stop

No remediation. No phase 6. Database left as found.
