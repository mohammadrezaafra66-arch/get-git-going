# Data-gap worklist — 2026-08-17

**Code HEAD:** `99f6bd58` (working tree exactly `origin/staging`, 0 ahead / 0 behind — no `git pull` run, per Section 2)
**Live `APP_GIT_SHA`:** `bfcc723a` · **Branch:** `staging` · **Production: NOT CONTACTED**

> ⚠️ **TEST DATABASE — anonymised 2026-08-14.** Names and phone numbers are synthetic («مشتری آزمایشی ۱۷», «تأمین‌کنندهٔ آزمایشی ۱۰»). **Counts, structure, amounts and which records are incomplete are real; the names are not.** The purpose here is to prove the method and size the work. The same SQL, in §7, is ready to run against real data.

Method: every export function is `SECURITY DEFINER` with a `has_any_role(auth.uid(), …)` gate, and `auth.uid()` is NULL in `psql`. **No export function was invoked.** Each body was read with `pg_get_functiondef` and its blocking `CASE` replicated as a plain read-only `SELECT`. Query ids (`W1`, `L3`, …) refer to the sections of the SQL in §7.

---

## ⚠️ TWO CORRECTIONS TO THIS MISSION'S PREMISE — read before anything else

**1. The purchase numbers in the brief do not match this database.**

| | Brief said | Measured (`W1`) |
|---|---|---|
| Purchases | 289 | **101** |
| No supplier | 281 | **92** |
| Suppliers without Asan code | 15 | **13 of 15** |

I did not reconcile the difference and I am not guessing at it. Possible explanations include a different database, a different date, or a prior count taken against production. **Recorded, not decided** — per Section 0.

**2. 91 of the 92 supplier-less purchases are automated-test residue, not business records.**

Classified by their `notes` field (`L6`):

| Class | Purchases | Value (Toman) |
|---|---|---|
| `E2E_test_marker` (notes start `E2E_`) | **89** | 360,400 |
| `PROBE_marker` (`PROBE_do_not_keep`, `C3_CONCURRENCY_PROBE`) | **2** | 10,000 |
| **no notes — the only plausibly real purchase** | **1** | **7,840,000,000** |

That single row is `6bcc3544`, 2026-08-02, 70 × «کولر گازی جنرال گلد 24000 مدل پلاتینیوم». It is **99.995% of the missing purchase value**.

**So "92 purchases need a supplier" is not 92 units of human work. It is one real decision, plus 91 rows of test junk that should be deleted rather than filled in.** Whether to delete them is the owner's call and is out of scope here.

---

## 1. START HERE — the leverage analysis

### What every Asan export produces *today* (replicated, all dates)

| # | Export option | Docs in scope | **Exportable** | Blocked |
|---|---|---|---|---|
| 1 | فاکتورهای فروش | 4 | **0** | 4 |
| 2 | فاکتورهای خرید | 101 | **2** (13,000,000,000 Toman) | 99 |
| 3 | دریافت‌ها و واریزها | 1 | **0** | 1 |
| 4 | پرداخت‌ها و برداشت‌ها | 0 | **0** | — |
| 5 | اسناد شخص ثالث (دوبل) | 0 | **0** | — |
| 6 | واریزی‌های بانکی | 1 | **0** | 1 |

**New finding that Phase 1C did not cover: the purchase export is the only Asan export producing a file today** — 2 documents, 13 billion Toman. Phase 1C measured only the four receipt-related options and correctly found all four empty; it never measured option 2.

### The single highest-leverage action

**Enter one Asan code — for customer «مشتری آزمایشی ۱۷» (`d05bbd0b`, person `a089aa60`).**

That one record currently blocks **three documents across three different export types**, all of which produce zero files today:

| Document | Export | Value | After the code is added |
|---|---|---|---|
| Bank deposit for receipt `fd8194a5` | #6 واریزی‌های بانکی | 10,100,000,000 | **becomes exportable** |
| Journal entry `6d6b1896` | #3 دریافت‌ها و واریزها | 10,100,000,000 | **becomes exportable** |
| Quote `SQ-2026-000024` | #1 فاکتورهای فروش | 500,500,000 | **becomes exportable** |

One data entry turns three empty exports into producing exports. Nothing else in this database has that property.

### The highest-leverage action by money

**Enter Asan codes for 4 suppliers** → unblocks **5 purchase documents worth 31,665,000,000 Toman** (`L1`, `L7`):

| Supplier | Purchases unblocked | Value |
|---|---|---|
| تأمین‌کنندهٔ آزمایشی ۱۰ (`b05f3194`) | 3 | 26,800,000,000 |
| تأمین‌کنندهٔ آزمایشی ۸ (`84d90f79`) | 1 | 4,800,000,000 |
| تأمین‌کنندهٔ آزمایشی ۶ (`6e9a0239`) | 1 | 65,000,000 |
| تأمین‌کنندهٔ آزمایشی ۵ (`4ba1a0ed`) | **0** — its one purchase is 24,999,999.99, a fractional amount that blocks regardless | 0 |

More money than the customer code, but it only feeds one export — the one that already works.

### The dependency order — this matters more than the counts

Every export checks its blocking conditions **in a fixed order**, and the Asan code is checked **before** everything except missing line items:

```
no line items  →  NO ASAN CODE  →  not accounting-registered  →  stock not deducted  →  fractional amount  →  line-sum mismatch
```

**Consequence the owner must know: ticking «ثبت شد در حسابداری» on a quote achieves nothing while its customer has no Asan code.** The document stays blocked and the reason simply changes. Quote `SQ-2026-000003` is exactly this case — it is unregistered *and* its customer has no code *and* its stock was never deducted. Three gaps stacked on one document.

So the order is:

1. **Asan codes for persons (customers and suppliers).** Nothing downstream matters without them.
2. **Supplier assignment on the one real purchase** (`6bcc3544`, 7.84bn) — and a decision about the 91 test rows.
3. **`accounting_registered_at` ticking** — only 1 quote, and it is blocked on two other things as well.
4. **Stock deduction** — not data entry; see §6.

### If every data gap were closed

Purchase export (`L2`): **99 of 101 would export**; 2 would still block on fractional Toman amounts. Sales export: 3 of 4 would export; 1 would still block on stock. Receipt-side exports: both currently-blocked documents would clear.

---

## 2. PURCHASES WITH NO SUPPLIER

**92 rows, 7,840,370,400 Toman, none paid, none with a payment voucher** (`W1`, `W2`). Full list in `DATA-GAP-WORKLIST-DETAIL.md` §D1.

| Metric | Value |
|---|---|
| Purchases total | 101 |
| With supplier | 9 |
| **Without supplier** | **92** |
| Value without supplier | **7,840,370,400** |
| Of those, paid | **0** |
| Of those, unpaid | **92** |
| With a payment voucher | **0** (the table holds 0 rows) |

`supplier_id` and `supplier_person_id` never disagree (`W16`): 9 have both, 92 have neither. So there is no half-linked case to untangle.

**The actionable set is one row:**

| Purchase | Date | Amount | Product | Notes |
|---|---|---|---|---|
| `6bcc3544` | 2026-08-02 | **7,840,000,000** | کولر گازی جنرال گلد 24000 مدل پلاتینیوم GG-MS24000 PLATINUM معمولی سرد وگرم (70 units) | *(none)* |

The other 91 carry explicit test markers in `notes` and total 370,400 Toman. See the correction at the top.

---

## 3. SUPPLIERS WITH NO ASAN CODE

**13 of 15 suppliers have no `asan_person_code`** (`W3`, `W4`). Full list in DETAIL §D2.

**Suppliers with no person record at all: 0 rows.** This is structurally impossible — `suppliers.person_id` is `NOT NULL` and no orphan references exist (`W0b`). The same is true of `customers`. So the "worse problem" the brief anticipated does not occur in this schema.

Only **4 of the 13** have any purchases attached; the other 9 have zero and are therefore zero-value work today:

| Supplier | Person | Purchases | Value | Unblocks if coded |
|---|---|---|---|---|
| تأمین‌کنندهٔ آزمایشی ۱۰ (`b05f3194`) | `ee20926a` | 4 | 26,800,000,024.95 | **3 docs / 26.8bn** (the 4th is fractional) |
| تأمین‌کنندهٔ آزمایشی ۸ (`84d90f79`) | `1a71b1e2` | 1 | 4,800,000,000 | **1 doc / 4.8bn** |
| تأمین‌کنندهٔ آزمایشی ۶ (`6e9a0239`) | `dc76b4a6` | 1 | 65,000,000 | **1 doc / 65m** |
| تأمین‌کنندهٔ آزمایشی ۵ (`4ba1a0ed`) | `46f4be38` | 1 | 24,999,999.99 | **0** — fractional amount blocks it anyway |
| 9 others | — | 0 | 0 | 0 |

For contrast, the 2 suppliers that **do** have codes (`W17`): تأمین‌کنندهٔ آزمایشی ۱۲ (code `601702`, 2 purchases — these are the only 2 exportable purchase documents) and تأمین‌کنندهٔ آزمایشی ۴ (code `90019001`, 0 purchases).

**Note on the mirror column:** only 2 suppliers have a non-blank `suppliers.accounting_code`, and they are the same 2 that have identifiers. The export does **not** read `suppliers.accounting_code` for the purchase path — it reads `person_identifiers.value_normalized`. Filling the mirror column by hand would not help.

---

## 4. CUSTOMERS WITH NO ASAN CODE

**13 of 23 customers have no `asan_person_code`** (`W5`, `W6`). Full list in DETAIL §D3.

Only **2 of the 13** have any activity:

| Customer | Person | Receipts (approved) | Accepted quotes | Receipt value | Quote value |
|---|---|---|---|---|---|
| **مشتری آزمایشی ۱۷** (`d05bbd0b`) | `a089aa60` | **4 (1)** | **3** | **10,276,000,000** | **663,600,000** |
| مشتری آزمایشی ۶ (`61ba4ba6`) | `630403fb` | 1 (0) | 0 | 50,000,000 | 0 |
| 11 others | — | 0 | 0 | 0 | 0 |

**مشتری آزمایشی ۱۷ is the single most valuable data entry in this database.** It is the customer on the one approved receipt, the one journal entry, and all three Asan-code-blocked sales quotes.

### Impact of the owner's new blocking rule

If "a missing Asan code blocks document creation" were enforced today (`W7`):

**13 of 23 customers (57%) could not have a receipt recorded — all 13 are `is_active = true`.**

That is a real operational cost to weigh. Note also that all 11 existing `asan_person_code` rows have `status = 'provisional'` (`W0`), and **the export does not filter on `status`** — a provisional code exports fine. So the rule would only need the code to exist, not to be verified.

---

## 5. SALES QUOTES NOT MARKED ACCOUNTING-REGISTERED

**1 row, not 57** (`W8`, `W9`). Only 4 quotes are `accepted` at all; 3 are already registered.

| Quote | Date | Customer | Amount | Stock deducted | Customer has Asan code |
|---|---|---|---|---|---|
| `SQ-2026-000003` (`4850549b`) | 2026-07-21 | مشتری آزمایشی ۱۷ | 100,100,000 | **no** | **no** |

**This row is flagged distinctly, exactly as the brief asked: ticking it will not release it.** It carries three independent blocks. In the export's evaluation order the code is checked first, so its `blocked_reason` today is «no Asan code» — the registration gap is not even the reason it is being rejected (`L3`).

### The full accepted-quote picture (`L3`) — all 4 blocked

| Quote | Amount | Asan code | Registered | Stock out | **Blocking cause** |
|---|---|---|---|---|---|
| `SQ-2026-000024` | 500,500,000 | — | yes | yes | `BLOCK_no_asan_code` ← **clears with the one customer code** |
| `SQ-2026-000003` | 100,100,000 | — | **no** | **no** | `BLOCK_no_asan_code` (then two more) |
| `SQ-2026-000005` | 63,000,000 | — | yes | **no** | `BLOCK_no_asan_code` (then stock) |
| `SQ-2026-000004` | 62,200,000 | `119041` | yes | **no** | `BLOCK_stock_not_deducted` |

All 4 accepted quotes have both `customer_id` and `customer_person_id` populated (`L5`), so no linking work is needed.

---

## 6. BLOCKED BY SOMETHING OTHER THAN DATA ENTRY

The owner should not spend time on these expecting them to clear:

1. **Two purchases with fractional Toman amounts** — `bd3f75a2` (24,999,999.99) and `a573a5d0` (24.95). The export refuses them rather than rounding, to keep the Toman→Rial conversion exact. **No amount of supplier or code entry will release them** (`L1`, `L2`). They need an amount correction or a deliberate decision to exclude them.
2. **Two accepted quotes whose stock was never deducted** — `SQ-2026-000005` and `SQ-2026-000004`. The export's own message says these «پیش از فعال‌شدن سازوکار کسر موجودی قطعی شده است» — they were finalised before the stock-deduction mechanism existed. This is a historical gap, not a form the accountant can fill.
3. **91 automated-test purchases.** These are junk to delete, not records to complete.
4. **`external_parties`: 1 row, 0 with an `accounting_code`** (`W13`). Any third-party (دوبل) document would block on this. No such document exists yet, so it is latent.
5. **`asan_control_accounts` holds only `invoice_ar = 989`** (`W14`). `clearing` and `other` have no row and therefore **always** block — deliberately, per the function's own comment. This is configuration, and only the owner can supply those codes if they should exist.
6. **The ledger itself.** Exports 3, 4 and 5 read `journal_entries`, which holds 1 row. Payment vouchers and settlements have never posted (0 rows each). No amount of data entry in the four gaps above changes that — see `ASAN-EXPORT-REALITY.md` §8.

---

## 7. HOW TO RUN THIS AGAINST REAL DATA

The full SQL is reproduced in `DATA-GAP-WORKLIST-DETAIL.md` §D5, ready to run unchanged. It is **read-only**: every statement is a `SELECT`, there is no DDL or DML anywhere in it.

To run it elsewhere:

```powershell
# write the .sql file with an editor (NOT shell redirection - PowerShell produces UTF-16)
docker cp worklist.sql <db-container>:/tmp/worklist.sql
docker exec -e PGPASSWORD=$pw <db-container> psql -U supabase_admin -d <dbname> -f /tmp/worklist.sql
docker cp <db-container>:/tmp/worklist.out .\worklist.out
```

The file begins with `\o /tmp/worklist.out` so no Persian reaches the terminal. **Read the `.out` file with an editor, not the console** — the terminal reverses RTL text.

**Three warnings for a production run:**

1. **Production access requires the owner's explicit authorisation.** This mission never contacted `192.168.170.10`.
2. **The production database is named `postgres`, not `afrakala`.** Passing `-d afrakala` there fails with *"database afrakala does not exist"*.
3. Run it as a **read-only measurement**. Nothing in this file writes, but it should still be reviewed before running against real records.

---

## 8. WHAT THIS DOES NOT TELL US

- **Nothing about production volumes.** 101 purchases, 23 customers, 15 suppliers and 4 accepted quotes is a test fixture. The brief's own figures (289/281) differ from what is here, and that discrepancy is unresolved.
- **Which supplier the one real purchase came from.** Only the owner knows. The row carries no free-text supplier name, no invoice number, and no `number` — the only clues are the date (2026-08-02), the product, and the amount.
- **What the correct Asan codes are.** They come from the Asan system, not from this database.
- **Whether the 91 test purchases should be deleted.** That is a decision, and deletion is a write this mission cannot make.
- **Whether the anonymisation of 2026-08-14 removed Asan codes that previously existed.** Phase 1C raised this; it remains `UNCERTAIN`. All 11 surviving codes are `status='provisional'`, and `person_identifiers` has no revoked/deleted-row mechanism visible in its column list — but I did not verify what the anonymisation touched.
- **Whether real customers lack codes at the same 57% rate.** If they do, the owner's new blocking rule is a much larger operational change than it appears here.

---

## BLOCKED

Nothing was blocked by the read-only constraint.

Deliberate non-actions, per the mission rules:
- **No export function was invoked.** All four `asan_list_*` functions are role-gated `SECURITY DEFINER`; their bodies were read and their blocking `CASE` chains replicated as plain `SELECT`s.
- **No `git pull`** — the tree was already exactly `origin/staging`.
- **Production was not contacted** in any form.
- Temp SQL went to the session scratchpad (`C:\afrakala-backups\` does not exist on this host), `docker cp`'d in as `/tmp/disc.sql`, `/tmp/worklist.sql`, `/tmp/bodies2.sql`, `/tmp/leverage.sql`. Host copies deleted; container `/tmp` copies left in place, since deleting them would be a container write.

One departure from the brief, stated so it can be judged: §3a asked for "any free-text supplier name the row carries". **`purchases` has no free-text supplier column** — its columns are `number`, `supplier_id`, `supplier_person_id`, `notes`, and product fields (`D1`). I substituted `notes` and the joined product name, which is what actually exists.

---

```
=== HANDOFF STATE ===
Purchases with no supplier:        92  (total value: 7,840,370,400 Toman)
                                   ...of which 91 are E2E/PROBE test residue worth 370,400 total;
                                   the actionable set is 1 purchase worth 7,840,000,000
Suppliers with no Asan code:       13 of 15  (of which no person record: 0 - structurally impossible)
                                   ...only 4 have purchases attached
Customers with no Asan code:       13 of 23  (blocked by new rule: 13, all active)
                                   ...only 2 have activity; 1 of those blocks 3 documents
Accepted quotes not registered:    1 of 4  (SQ-2026-000003) - and it is blocked on 2 further grounds
Highest-leverage action:           One Asan code for customer مشتری آزمایشی ۱۷ (d05bbd0b) -
                                   unblocks 3 documents across 3 export types that produce nothing today
Blocked by non-data causes:        6 categories (see section 6); incl. 2 fractional-amount purchases
                                   and 2 quotes with no stock deduction
Writes performed:                  NONE
Container restarted:               NO
Production touched:                NO
Files produced:                    docs/research/DATA-GAP-WORKLIST.md (+ DATA-GAP-WORKLIST-DETAIL.md)
Next phase:                        human review, then the same queries against real data.
```
