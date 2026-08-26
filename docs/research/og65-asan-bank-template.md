# OG-65 — the bank template: measured headers, 15 columns, and a sign that belongs to one layout

Built on 2026-08-26 for mission 10 of the chained execution (branch
`feature/og65-asan-bank-template`). The #356 audit found both templates already implemented;
this mission applies the three corrections the owner settled after reading the real Asan
`.xlsx` cell by cell.

---

## 1. The headers — measured file wins

The owner's template holds:

```
A='Date'  B='Code_M'  C='Name_Moshtare'  D='Shopmare_Peygeri'  E='Mablagh'  F='Bank_cod'
G..O = ''   (empty strings, not null cells)      max_col = 15
```

The code was writing `Name_Moshtari` (C) and `Shomare_Peygiri` (D). **Those were the wrong
side.** Both measured spellings look like misspellings and both are legacy-intentional in
Asan; correcting them would land real data in the wrong column of live accounting software.

**The specs were the reason the wrong headers survived.** Two of them *asserted* the wrong
pair:

```
e2e/asan/export-bank-deposits.spec.ts:27   "reproduced **exactly** — `Name_Moshtari`, not …"
e2e/asan/export-bank-deposits.spec.ts:98   "Name_Moshtari", "Shomare_Peygiri"
e2e/asan/export-shell.spec.ts:274-279      the same pair
```

A test asserting a wrong value does not merely fail to catch the defect — it **defends** it,
and it makes a correct fix look like a regression. Both specs are corrected and each now
carries the reason in place, so the next reader does not "fix" it back.

**Template 2 was measured too and needs no change**: `کد حساب، کد کالا، شرح، تعداد، بدهکار،
بستانکار` is exactly what `JOURNAL_HEADERS` already writes. It was not touched.

## 2. G–O must be empty STRINGS, not nulls

`write-xlsx` builds the sheet with `aoa_to_sheet`. That function writes **no cell at all**
for `null` and a real empty cell for `""`. So padding with `null` produces a six-column file
that looks correct in a code diff and is the wrong width in Asan. The gate asserts both the
width (15) and the type of each padding cell (`""`, not null), and disturbance **D3** —
padding with `null` — is caught by exactly that.

## 3. The sign belongs to layout 4 alone

The bank file carries direction in the **sign of the single `Mablagh` column**: receipt
positive, payment negative. The accounting document (layout 3) carries direction in
**separate `بدهکار` / `بستانکار` columns**, where a negative amount would corrupt
double-entry rather than express a direction.

The minus lands on the left for free because `write-xlsx` writes amounts as **real numbers**,
never formatted strings — a formatted string is not summable in Excel. Zero is left as zero:
`-0` is a real IEEE-754 value and would serialise as `-0`.

### Scope boundary, stated rather than implied

`asan_list_bank_deposit_export` reads `payment_receipts`, has **no direction column and no
payments source** — its result shape is
`(doc_id, doc_label, doc_date, party_name, person_code, tracking_number, amount, bank_code,
bank_title, blocked_reason)`. Bank payments today route to **template 2** through
`asan_list_journal_export`.

So: **the mapping supports payments; no data source feeds them into this layout yet.**
Wiring one needs an RPC change, and this mission's scope is `src/lib/asan/` only. The row
type therefore defaults an absent `direction` to `receipt` — the safe value, and the only one
the wired source can produce. The gate proves both directions on **constructed** rows, which
is the same reason the row builder was split out of the data access in the first place: so a
test can assert the shipped mapping rather than a retyped copy.

---

## 4. Gate attack (A2.12) — 1 control + 12 disturbances, all caught

Each disturbance edits the **shipped source**, asserts the edit landed (reading it back
before running anything), runs the gate, and restores.

| # | disturbance | proof of construction | result |
|---|---|---|---|
| D0 | **control**, healthy | — | **PASS** |
| D1 | revert C to `Name_Moshtari` | `"Name_Moshtari", // C` | CAUGHT — header assertion |
| D2 | revert D to `Shomare_Peygiri` | `"Shomare_Peygiri", // D` | CAUGHT — header assertion |
| D3 | pad G–O with `null` | `() => null,` | CAUGHT — width/empty-string |
| D4 | drop the padding (6 columns) | `return [[...named]];` | CAUGHT — width |
| D5 | **negate everything**, receipts too | `if (rial === null \|\| rial === 0)` | CAUGHT — receipt-positive |
| D6 | negate nothing | `return rial;` | CAUGHT — payment-negative |
| D7 | **leak sign handling into template 2** | a `direction` marker in `export-journal-rows.ts` | CAUGHT — template-2 assertion |
| D8 | **return the amount as a formatted string** | `"-" + rial … as unknown as number` | CAUGHT — `typeof number` |
| D9 | produce `-0` for a zero payment | `if (rial === null \|\| direction !== "payment")` | CAUGHT — `Object.is(-0)` |
| D10 | Jalali date with dashes | `` return `${pad(jy, 4)}-${pad(jm)}-${pad(jd)}`; `` | CAUGHT — date shape |
| D11 | default an absent direction to payment | `r.direction === "receipt" ? … : "payment"` | CAUGHT — default-is-receipt |
| D12 | a Persian header in column B | `"کد مشتری", // B` | CAUGHT — no-Persian assertion |

**D10 failed to construct on its first attempt and was rebuilt, not counted.** The first form
patched a literal `'/'` in `dates.ts`; the separator is inside a template literal, so the
patch never applied. The harness asserted the edit before running and reported
`NOT CONSTRUCTED` rather than a catch — which is A2.12(d) working, and the second time in
this chain it has fired.

**D8 is A2.12(b)'s "numeric returned as a string" class, and this is the first mission where
it has a real attack surface.** Every previous gate in this chain made only catalogue and SQL
checks, so the class was recorded as inapplicable each time. Here the gate reads a
spreadsheet cell, and a `Mablagh` written as `"-15000"` instead of `-15000` looks identical
in the file and is not summable in Excel. The gate types the cell, so it is caught.

**D5 is the A2.10 half**: a change that negates every amount closes nothing and breaks
receipts, and it must fail rather than read as "sign handling works".

---

## 5. What the gate asserts

- the six header strings **byte-for-byte**, and no Persian anywhere in the header row;
- the sheet is **15 columns**, and G–O are `""` and not null — header row and every data row;
- a receipt's `Mablagh` is **positive**, a payment's is the same magnitude **negated**, and an
  absent direction behaves as a receipt;
- the amount is a real **number**, not a formatted string;
- **Toman × 10 → Rial** (1500 → 15000);
- the Jalali date is `YYYY/MM/DD` with **slashes and Latin digits**;
- **no sign handling exists in the template-2 mapping** — direction there is columns.
