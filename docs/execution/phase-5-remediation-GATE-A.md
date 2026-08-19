# GATE A — phase 5 remediation — independent supervising engineer review

**Reviewed:** 2026-08-19, against `staging @ fb23f7fe` (PR #323 merged; migration **367**).
**Scope:** the remediation of phase-5 Gate A defects M1–M4 and m1–m3. I did not write 367. I did
not start phase 6. This file is the only deliverable.
**Method:** live catalogue (`pg_get_functiondef`, `pg_get_constraintdef`, `pg_proc.proacl`). Behaviour
tested by invoking the **real** `asan_list_journal_export` under a simulated JWT inside
`BEGIN … ROLLBACK`. Frontend wiring read from `src/` and `e2e/` — it cannot be proved from SQL.
Production (`192.168.170.10`) was not contacted. Persian output via `\o`, read from a file.

**Database left byte-for-byte as found.** Census first connection and after the last probe:

```
dual_documents|0          journal_entries|3        journal_lines|6
payment_receipts|8        payment_vouchers|0       document_numbers|155
numbers_live|2            audit_logs|43485        public_functions|841
credit_ledger|3           OG14-CONC|1 (reversed)
=== DIFF baseline vs now ===
IDENTICAL — this review left the database as found
```

OG14-CONC and its reversal are 343-undeletable pre-existing rows. They are not this mission's residue.

I did not remediate.

---

## Verdict

# PASS — 0 BLOCKER, 0 MAJOR, 2 MINOR

The narrowing removes exactly what the owner named. A bank receipt and a bank payment created inside
`BEGIN … ROLLBACK` **still export**. A cheque receipt, a cheque payment, and both legs of a fresh
reversal **do not**. Dual documents still land on `third_party`. `purchase_payment` and `settlement`
land on the new filter and on `all`. The live range's **0 unblocked documents** is the blocked seed
plus the excluded OG14-CONC pair — not a silent wipe of every bank voucher.

The fourth menu is wired end to end: `AsanExportKey` → registry → `ASAN_EXPORT_ORDER` → the page
`<SelectItem>` → `makeJournalExport(..., "purchase_and_settlement")` → `supabase.rpc` `_filter` →
the live function's `NOT IN` list and `WHERE` clause.

Two MINORs are stale comments in `src/`. They do not change what the accountant gets.

---

## Defects found

| # | Severity | Location | Description | Evidence | Recommendation |
|---|---|---|---|---|---|
| **m1** | MINOR | `src/lib/asan/export-journal.ts:3-11` | Header comment still says *three* journal exports share the builder and *all three* carry `oneDocumentPerFile`. A fourth definition (`PURCHASE_SETTLEMENT_EXPORT`) now uses the same helper. Harmless; a later reader will think the fourth is a fork. | File read: comment "exports 3, 4 and 5" / "All three carry `oneDocumentPerFile`"; lines 104–109 add export 6 through `makeJournalExport`. | Update the comment to four filters over one builder. |
| **m2** | MINOR | `src/lib/asan/export-types.ts:4-5` | Types file still describes "Five exports … plus a secondary bank-deposit path." The union now has **seven** keys. Same class of residue as m1. | `AsanExportKey` has seven members; comment still says five plus bank. | Recount the comment. |

**Count: 0 BLOCKER, 0 MAJOR, 2 MINOR.**

---

## Over-exclusion — is anything missing that should be there?

**No bank document of any kind I could create is now excluded.**

| Construct (ROLLBACK) | Still in the file? |
|---|---|
| Bank receipt `GA367-BANK-R` | **Yes.** `BANK_R_N all=2 receipt=2`. Lines `bank` + `customer_credit`; `document_channel` NULL (C6: no `'bank'` value). |
| Bank payment `GA367-BANK-P` | **Yes.** `BANK_P_N all=2 payment=2`. |
| Dual `GA367-D1` | **Yes.** `DUAL_N all=2 third_party=2`. Lines `supplier_payable` + `customer_credit` — no cheque kind. |
| Cheque receipt | **No** (owner). `CHQ_R_N` 0 rows. Lines `cheque_receivable` + `customer_credit`, channel `cheque`. |
| Cheque payment | **No** (owner). `CHQ_P_N` 0 rows. Lines `supplier_payable` + `cheque_payable`, channel `cheque`. |
| Bank receipt then `reverse_document` | **Neither leg.** `AFTER_REV` 0 rows under all five filters including `purchase_and_settlement`. |
| Live seed `6d6b1896` | **Listed, blocked** (customer Asan code) — same as before 367. |
| OG14-CONC original + reversal | **Absent** (owner: both legs). |

Live `_filter='receipt'` `2026-07-01`–`2026-08-31`: **1 document / 2 lines** (seed). `OG14 n=0`. That
matches the mission. The 0 unblocked exportable files from the generator are this seed (blocked) plus
the excluded pair — **not** proof that a standing bank receipt would be dropped. I built one; it
exported.

**Reversal predicate:** `journal_entries_reverses_entry_id_fkey` is `FOREIGN KEY (reverses_entry_id)
REFERENCES journal_entries(id)`. A row that points at another entry *is* a reversal row by schema;
nothing else uses the column. An unrelated document cannot be excluded unless someone posts a
reversal that names it — which is the operation the owner wants omitted. The original is excluded
only when a **posted** row points at it, so a dangling pointer cannot hide a live document.

**Cheque predicate vs dual/settlement:** `create_receipt` / `create_payment` are exclusive channel
(measured: cheque receipt has **no** `bank` line; cheque payment has **no** `bank` line; dual has
**no** cheque kind). `pay_purchase_with_voucher` **never writes** `cheque_payable` / `cheque_receivable`;
live `prosrc` always posts `supplier_payable` + `bank`. If that RPC is called with
`_document_channel='cheque'`, 367 still drops the voucher because of the source channel, which is
T15 (cheque = manual) even though the *lines* look like a bank payment — a pre-existing PPWV shape,
not a 367 over-exclusion of dual/settlement.

**Cash** remains in the *journal* export if posted that way (T15 excludes cash only from the
bank-deposit export, 350). 367 does not add a cash exclusion. Not tested with a new cash receipt
(adjacent, not named).

---

## Frontend wiring of the fourth menu — end to end

**Wired.** The page does not hard-code six types; it renders `ASAN_EXPORT_ORDER`.

| Layer | What I read |
|---|---|
| `export-types.ts` | `AsanExportKey` includes `purchase_settlement`. |
| `export-journal.ts` | `JournalFilter` includes `purchase_and_settlement`. `PURCHASE_SETTLEMENT_EXPORT = makeJournalExport("purchase_settlement", "پرداخت‌های خرید و تسویه", "purchase_and_settlement", …)` — same helper as receipts/payments/third_party: `layout: "journal"`, `oneDocumentPerFile: true`, `docType: "accounting_document"`, same `targetScreen`. |
| `listJournalDocuments` | `supabase.rpc("asan_list_journal_export", { _from, _to, _filter: filter })`. |
| `export-registry.ts` | `purchase_settlement: PURCHASE_SETTLEMENT_EXPORT` in the `Record`; order is sales, purchase, receipts, payments, third_party, **purchase_settlement**, bank_deposits. |
| `_app.admin.asan-export.tsx:322-326` | `{ASAN_EXPORT_ORDER.map((k) => <SelectItem>{ASAN_EXPORTS[k].label}</SelectItem>)}`. |
| Live SQL | `_filter NOT IN (…, 'purchase_and_settlement')`; `WHERE _filter = 'all' OR (_filter = 'purchase_and_settlement' AND k.dkind IN ('purchase_payment','settlement')) OR k.dkind = _filter`. |

**The seven:** `sales`, `purchase`, `receipts`, `payments`, `third_party`, `purchase_settlement`,
`bank_deposits`. e2e `expect(ASAN_EXPORT_ORDER.length).toBe(7)` matches that list; the number was
updated to the registry, not the other way around. `oneDocumentPerFile` loop includes
`purchase_settlement`.

Label «پرداخت‌های خرید و تسویه» matches the filter (purchase payments and settlements). I did not
open a browser; the string is what the Select renders.

**`all`:** not a page menu. RPC `_filter='all'` returns remaining posted entries, including blocked
`other` (`OTHER all=2` only). The only createable kind with **no** page menu is `other`, which the
owner left unclassified and blocked. That is not M2 in a new place. `_filter='settlement'` still
works on the RPC (`SETL settlement=2`) and is unused by the page; the page uses the combined filter.

---

## Verified-correct

| Check | Live result |
|---|---|
| M1 both legs | Live OG14 pair n=0. Fresh reverse: `AFTER_REV` 0 rows. Timing caveat **recorded** in T15 and the progress file: exclusion is not a correction of an already-imported file. |
| M3 cheques | Receipt and payment absent under every filter. No 0-toman empty row. |
| M2 menu | PP `purchase_and_settlement`+`all` only; SETL same plus leftover RPC `settlement`. Kinds `purchase_payment` / `settlement`. |
| m2 Persian | `OTHER_BR`: `نوع حساب «سایر» هنوز تعریف نشده است و کد آسان ندارد`. Live `«other»` in function def: **f**. `src/lib/asan/` has no `invoice_ar` / `«other»`. |
| m3 note | `CONTROL_ACCOUNT_NOTE` is Persian; no `invoice_ar`. |
| M4 / m1 generator | Ran `node docs/verification/asan/gen-phase-5-samples.mjs` → `exportable_documents 0 rpc_rows 2 blocked_or_empty_skipped 2`. **No xlsx written.** Calls live RPC `_filter='all'` then skips blocked rows (same as the page). Does **not** reimplement cheque/reversal rules. Honest about unproven payment/dual on this DB. |
| Old concatenated sample | **Not in the repository** (`git diff` 12 paths, no xlsx). Generator produced none. Warning in `00-progress.md` (programme ledger the owner is told to read) and the generator header. |
| 294 `$chk$` | `CHK_OK` `n_fn=1` `no_ascii_q=t` kinds t t t `balance=t` `one_side=1`. |
| Bank-deposit export | `BANK_DEP n=1` seed; `BANK_CONC n=0`; `BANK_CASH n=0`. 350 undisturbed. |
| Security | `prosecdef=t` `search_path=public`. ACL postgres/supabase_admin/authenticated/service_role only. No `anon`, no PUBLIC. |
| `367-down.sql` | `CREATE OR REPLACE` same `(date, date, text)`. No outer BEGIN/COMMIT. Restores **366** body (`stored_kind`, no 367 exclusions). Header: roll 367-down first; 366-down still the heuristic. 294-down DROP of this signature remains valid. |
| Rule 13 | `git diff --name-only 8eef6f45 fb23f7fe` is exactly twelve paths. `src/` four files + e2e are the fourth menu the brief required. |
| Typecheck | `npm run typecheck`: **70** `error TS` lines. Filtered for `export-journal\|export-registry\|export-types\|export-shell`: **no matches**. Last errors are `src/routes/_app.products.index.tsx` (baseline). |
| T15 | General rule: manual path → absent entirely, never a partial row. Table bank/cash/cheque/reversal. Binding sentence for a later document type. Timing caveat present. |
| D8 | Amended 2026-08-19; no longer contradicts T15. D11 (ledger trail) is a different surface than the Asan file. |
| D17 | Originally froze `_filter` as `all\|receipt\|payment\|third_party` so 5.1 would not break callers. Amending it for the fourth menu is the right decision. |

---

## Verdict on each inherited defect

| ID | Closed? |
|---|---|
| **M1** | **Genuinely closed.** Both legs gone; no labelling needed. |
| **M2** | **Genuinely closed.** Fourth menu wired; `other` correctly still not a menu. |
| **M3** | **Genuinely closed.** Cheque documents absent, not listed at ۰ تومان. |
| **M4** | **Genuinely closed** as a generator contract (one doc per file, live RPC). Live samples: zero files, which is honest. |
| **m1** | **Genuinely closed** (generator). |
| **m2** | **Genuinely closed** (Persian «سایر»). |
| **m3** | **Genuinely closed** (note). |

---

## What I could not verify

- **Nothing here proves Asan accepts a file.** Only the owner importing a download from
  `/admin/asan-export` can. There is currently **no unblocked journal document** on this database to
  trial.
- **Browser render** of the seventh Select item. The label string and the map are correct; I did not
  open `/admin/asan-export`.
- **`pay_purchase_with_voucher` end-to-end** with `_document_channel='cheque'` (would need a live
  purchase). Catalogue: it still posts **bank** lines; 367 would drop it on channel. Not invoked.
- **A cash receipt** in the journal export (T15 leaves it to 350's bank-deposit path).
- **Production.** Not contacted.

---

## Stop

No remediation. No phase 6.
