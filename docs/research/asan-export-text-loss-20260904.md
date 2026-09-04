# The Asan export loses all text on import — root cause

**Date:** 2026-09-03 (filename per the brief: `…-20260904`) · **Type:** read-only, five agents + integrator
**Symptom (owner):** "The Excel file I export from the platform to import into Asan — when I bring it
into Asan, only the number columns survive. Everything else is wiped."

---

## 0. Environment and validity

| Item | Value |
|---|---|
| `hostname` | **VIRA-SERVICE** — the test computer. **Production was never contacted.** |
| Database | `afrakala` on `afrakala-lan-db`, read-only `SELECT` / `pg_get_functiondef` only |
| Working-tree branch | `feature/quote-customer-picker-readonly` — **not** touched, no checkout, no commit |
| RPC access | The four `asan_list_*_export` functions are `SECURITY DEFINER` gated on `has_any_role(auth.uid(),…)`; `auth.uid()` is NULL in `psql`. **The gate was not bypassed.** Their bodies were read and replayed as plain `SELECT`s. |
| Files written | Scratchpad only. Nothing in the repo was created, edited or deleted. |

**The captured Asan templates are NOT in the repository** — `.gitignore:122-125` records the owner's
instruction *"my repo should contain zero xlsx files ever"* and ignores `*.xlsx`. They were found
**outside** it, and the real filenames use **spaces, not underscores**:

| File | Path | Signature |
|---|---|---|
| `واریزوپرداخت بانکی.xlsx` | `C:\Users\AFRA\Desktop\` and `D:\all\` (byte-identical, md5 `55097e10…`) | `50 4b 03 04` — OOXML zip |
| `سنددوبل اسان.xls` | same two locations (byte-identical, md5 `5c8988cc…`) | `d0 cf 11 e0 a1 b1 1a e1` — **genuine OLE2 / BIFF8** |
| **the owner's failing export** | `C:\Users\AFRA\Desktop\asan-receipts-2026-06-05_to_2026-09-03-selected-1.xlsx`, **2026-09-03 16:56**, 16 913 bytes | `50 4b 03 04` |

That third file is the one that failed, and it was inspected directly. This closes gate **OG-35**
(`docs/execution/00-progress.md:330` — *"OPEN — this is phase 5's exit condition and it has never
been met. No test anywhere in this repo can prove Asan accepts the file; only the owner opening one
in Asan can."*). He has now opened one. It failed.

---

## 1. Root cause

**Every text cell the platform writes is typed `t="str"`, which in OOXML does not mean "string" — it
means *the cached string result of a formula*. Asan's own templates never use it: both of them store
every text cell in a string table.** In `ECMA-376` `ST_CellType`, the literal-text types are `s`
(shared string) and `inlineStr`; `str` is defined as *"Cell containing a formula string"*. The cells
we emit carry `t="str"` with **no `<f>` element at all** — a formula cell with no formula. Numeric
cells carry no `t` attribute, i.e. plain `n`, and are read normally. That is exactly the reported
asymmetry, and it explains the second-order details too: account codes and tracking numbers arrive
empty because the row builders emit them as *strings* (`"8"`, `"600018"`, `"12364"`) despite looking
numeric, and **the header row vanishes as well** — which is why Asan maps no text column at all
rather than importing blanks into named ones. The cause is one missing option at
`src/lib/asan/write-xlsx.ts:33`: `XLSX.write(wb, { bookType: "xlsx", type: "array" })` passes no
`bookSST`, and SheetJS defaults it to `false` (`node_modules/xlsx/xlsx.js:23024` —
`['bookSST', false], /* Generate Shared String Table */`), which routes every string through
`xlsx.js:14792-14796`:

```js
if(opts && opts.bookSST) {
    v = writetag('v', ''+get_sst_id(opts.Strings, cell.v, opts.revStrings));
    o.t = "s"; break;
}
o.t = "str"; break;          // <-- every text cell in every Asan export
```

### The single strongest piece of evidence

Asan's own template and the file the owner exported today, side by side. Same six-column journal
layout, same six header strings, opposite storage:

```
ASAN'S TEMPLATE  — واریزوپرداخت بانکی.xlsx  (its xlsx template; verified by the integrator)
  xl/sharedStrings.xml   PRESENT  <sst count="7" uniqueCount="7">
  header cells           A1:s B1:s C1:s D1:s E1:s F1:s G1:s H1:s I1:s J1:s K1:s L1:s M1:s N1:s O1:s
                         ^^^ every single one t="s" -> string table

ASAN'S TEMPLATE  — سنددوبل اسان.xls  (the dual/journal template; BIFF8)
  SST total=6 unique=6 ; LABELSST row=0 col=0..5 -> SST[5],SST[4],SST[0],SST[1],SST[2],SST[3]
                         ^^^ SST + LABELSST is the BIFF equivalent of t="s"

THE OWNER'S FAILING FILE — asan-receipts-…-20260903…xlsx, exported 2026-09-03 16:56
  xl/sharedStrings.xml   ABSENT
  dimension              A1:F3
  row 1   A1 t=str "کد حساب"   B1 t=str "کد کالا"   C1 t=str "شرح"
          D1 t=str "تعداد"     E1 t=str "بدهکار"    F1 t=str "بستانکار"
  row 2   A2 t=str "8"
          B2 t=str ""
          C2 t=str "واریز از «خان محمدی» — پیگیری 1456789 — واریز به حساب بانکی شرکت"
          E2 t=(none) => NUMBER   690000000        <-- the only cell that survived
```

**Both of Asan's templates put text in a string table. We put text in the formula-result type and
ship no string table at all.** The one cell in the owner's file with no `t` attribute — `E2`,
`بدهکار`, `690000000` — is the one column he reports surviving.

This is not an artefact of any rebuild: it holds across **all 13** generated workbooks in the repo
(`t="str"` 6–29 per file; `t="s"` **0**; `inlineStr` **0**; `sharedStrings.xml` present in **0**),
and a faithful rebuild from the shipped modules produced a header row **md5-identical** to both
`docs/verification/m5-export-samples/4-bank-deposits.xlsx` and the owner's own real downloads.

### Why no test caught it

Every readback path in the repo uses SheetJS to read SheetJS's own output —
`e2e/asan/export-bank-deposits.spec.ts:96`, `export-journal.spec.ts:223`,
`export-shell.spec.ts:312/339/472`, `test-results/asan-real-uat/validate-workbooks.mjs:153` — and
SheetJS's **reader** normalises the type straight back (`xlsx.js:14944`:
`case 'str': p.t = "s"; p.v = utf8read(p.v)`). The round-trip is lossless *within SheetJS*
regardless of which type was written. Verified independently: **nothing** in `e2e/`, `test-results/`
or `scripts/` asserts a cell type, unzips a workbook, or mentions `sharedStrings`. The two prior
audits did not catch it either — OG-35 and OG-65 both compared **header text only**
(`docs/research/og35-asan-export-audit.md:14-35`, "same six columns, same order, same text"), and
`docs/research/og65-asan-bank-template.md:36` records template 2 as *"measured too and needs no
change"* on the strength of its six header strings. Neither examined cell type or container format.
OG-65's 12 disturbance tests all passed against a file Asan cannot read.

### The second, independent deviation

The owner's failing file is the **receipts/journal** export. Asan's template for that screen is
`سنددوبل اسان.xls` — a **genuine BIFF8 OLE2** file. We emit OOXML `.xlsx` and name it `.xlsx`
(`src/lib/asan/write-xlsx.ts:33` is the *only* `bookType` in `src/lib/asan`; the filename is built at
`_app.admin.asan-export.tsx:255`). No BIFF writer path exists anywhere in the codebase. This is a
second deviation on the same file and may compound with the first: a BIFF-era importer reading xlsx
through a thin shim is precisely the kind of reader that handles `t="n"` and drops `t="str"`.

---

## 2. Cell-by-cell diff — template vs generated

### Template 1 — `واریزوپرداخت بانکی.xlsx` vs our `gen-bank_deposits.xlsx`, header row

| Cell | Template | Generated | Difference |
|---|---|---|---|
| A1 | `t="s"` → `Date` | `t="str"` `<v>Date</v>` | **cell type** |
| B1 | `t="s"` → `Code_M` | `t="str"` | **cell type** |
| C1 | `t="s"` → `Name_Moshtare` | `t="str"` | **cell type** — text byte-identical |
| D1 | `t="s"` → `Shopmare_Peygeri` | `t="str"` | **cell type** — text byte-identical |
| E1 | `t="s"` → `Mablagh` | `t="str"` | **cell type** |
| F1 | `t="s"` → `Bank_cod` | `t="str"` | **cell type** |
| G1–O1 | `t="s"` → `<si><t /></si>` (index 6) | `t="str"` `<v></v>` | **cell type + empty `<si>` vs empty `<v>`** |

The template is **header-only** (`A1:O1`), so there is no template-side data row to diff. Ours, for
the record: `A2 str "1405/05/28"` · `B2 str "600018"` · `C2 str "شخص آزمایشی 23"` · `D2 str "12364"`
· `E2 (no t) 1200000000` · `F2 str "8"` · `G2..O2 str ""`.

Package level:

| | Template | Generated |
|---|---|---|
| `xl/sharedStrings.xml` | **present** (7 `si`) | **absent** |
| zip compression | `Defl:N` deflated | `Stored` uncompressed |
| zip mtime | `2026-08-24 17:58` | `(1980,0,0,0,0,0)` — invalid DOS date, month=0 day=0 |
| sheet name | `Sheet1` | `Asan` |
| extra parts | `xl/worksheets/_rels/sheet1.xml.rels` | `xl/metadata.xml`, `xl/theme/theme1.xml`, `docProps/*` (`<Application>SheetJS</Application>`) |
| styles | 8 real `FORMAT`s, `s="0"` on cells | SheetJS default, stray `numFmtId="56"`; no `s` on any cell |
| trailer | `<pageSetup/>` | `<ignoredErrors><ignoredError numberStoredAsText="1" sqref="A1:O5"/></ignoredErrors>` |

### Template 2 — `سنددوبل اسان.xls` vs our `gen-journal.xlsx`, header row

| Cell | Template (BIFF8) | Generated (OOXML) | Difference |
|---|---|---|---|
| A1 | `LABELSST` → SST[5] `کد حساب` | `t="str"` | **cell type + container** |
| B1 | `LABELSST` → SST[4] `کد کالا` | `t="str"` | same |
| C1 | `LABELSST` → SST[0] `شرح` | `t="str"` | same |
| D1 | `LABELSST` → SST[1] `تعداد` | `t="str"` | same |
| E1 | `LABELSST` → SST[2] `بدهکار` | `t="str"` | same |
| F1 | `LABELSST` → SST[3] `بستانکار` | `t="str"` | same |

Template record walk: `BOF version=0x0600 (BIFF8)` · `BOUNDSHEET 'Sheet1'` · `SST total=6 unique=6`
· `DIMENSIONS rows[0,1) cols[0,6)` · six `LABELSST`. **No inline `LABEL` record, no formula record.**

**The header text itself is correct in both templates** — all six Persian headers match `layouts.ts`
codepoint for codepoint, including `ک = U+06A9` (Persian keheh, not Arabic `U+0643`), and
`Name_Moshtare` / `Shopmare_Peygeri` are byte-identical to spec. The text is right; the *typing* is
wrong.

---

## 3. Hypotheses

| | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| **H1** | Text written as a cell type Asan does not read | **TESTED-TRUE — this is the root cause** | `t="str"` (formula-result) on every string cell, no `<f>`; numbers bare. `write-xlsx.ts:33`; serializer `xlsx.js:14792-14796`. Asan's own templates use `t="s"` / `SST`+`LABELSST` |
| **H2** | xlsx where Asan wants BIFF `.xls` | **TESTED-TRUE (our side) · UNTESTABLE-HERE (Asan's side)** | `سنددوبل اسان.xls` is genuine OLE2 `d0cf11e0a1b11ae1`; we emit `bookType:"xlsx"` only. But template 1 genuinely *is* `.xlsx` and its text is stored as `t="s"` — so H2 cannot be the sole cause, and H1 explains both files |
| **H3** | Header spelling mismatch | **TESTED-FALSE** | `Name_Moshtare` = `4e616d655f4d6f736874617265`, `Shopmare_Peygeri` = `53686f706d6172655f50657967657269` — byte-identical to the template. Fixed 2026-08-26, commit `1da2a778` |
| **H4** | UTF-8 vs Windows-1256 | **TESTED-FALSE** | `encoding="UTF-8"`, no BOM, strict-UTF-8 clean; `شرح` = `d8b4 d8b1 d8ad`; no `&#x` escapes, no mojibake. All six headers codepoint-equal to the template |
| **H5** | G..O written as NULL/absent | **TESTED-FALSE** | `<dimension ref="A1:O5"/>`, 15 real cells; `export-bank-deposit-rows.ts:77-80` emits `""`. Fixed in the same 2026-08-26 commit. *(A residual difference remains — ours is `t="str"` with empty `<v>`, the template is `t="s"` → `<si><t /></si>`; openpyxl yields `None` for ours vs `''` for the corrected form. Subsumed by H1.)* |
| **H6** | Date as Excel serial | **TESTED-FALSE — and correctly predicted not to match** | `<c r="A2" t="str"><v>1405/05/28</v></c>` — a Jalali string, not a serial. A serial would render as a *number*, not an empty cell |

H3 and H5 are dead rather than merely unproven: both were fixed on 2026-08-26 (`1da2a778`), and the
files on disk bracket that commit — the Aug 5 UAT file has `A1:F2` + `Name_Moshtari`, the Aug 27
sample has `A1:O2` + `Name_Moshtare`. The symptom is from Sep 3.

**Ranking of survivors.** **H1 first**, and by a wide margin: it is the only hypothesis whose
discriminator is *exactly* the line the owner describes — "has a `t` attribute naming a string type"
versus "has none" — and it alone explains why the headers disappear too. **H2 second**: real, worth
fixing for the dual/journal screen whose template is literally `.xls`, but it cannot explain the
bank file, and H1 covers both.

---

## 4. The fix — described and proposed, **NOT APPLIED**

### 4a. The one-line change that addresses the root cause

`src/lib/asan/write-xlsx.ts:33`:

```diff
-  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
+  // Asan's own templates store every text cell in a string table: واریزوپرداخت بانکی.xlsx uses
+  // t="s" + xl/sharedStrings.xml, and سنددوبل اسان.xls uses BIFF SST + LABELSST. SheetJS defaults
+  // bookSST to FALSE, which emits t="str" — the OOXML type for the cached string result of a
+  // FORMULA — on cells that have no formula, and ships no string table at all. Excel and SheetJS
+  // tolerate it; Asan drops every such cell, headers included, which is why only numeric columns
+  // survived the import on 2026-09-03. bookSST:true restores the canonical t="s" form.
+  return XLSX.write(wb, {
+    bookType: "xlsx",
+    type: "array",
+    bookSST: true,
+  }) as ArrayBuffer;
```

**Verified empirically against the project's own `xlsx@0.18.5`** (scratchpad only, nothing applied):

```
current       row2: A2:str B2:str C2:str D2:str E2:n F2:str    sharedStrings.xml ABSENT
bookSST:true  row2: A2:s   B2:s   C2:s   D2:s   E2:n F2:s      sharedStrings.xml PRESENT
              <sst count="29" uniqueCount="12"><si><t>Date</t></si><si><t>Code_M</t></si>…
```

Numeric cells are untouched (`E2` stays `n`), so the amount/debit/credit behaviour, the sign
convention and the Rial conversion are unaffected. This is a pure serialization change.

### 4b. The container question for the dual/journal layout — **owner's decision, not an agent's**

Asan's template for the «ورود اطلاعات تولید یا سند از فایل Excel» screen is a genuine BIFF8 `.xls`.
If Asan requires that container, the change is larger than one option:

```diff
-  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
+  return XLSX.write(wb, { bookType: "biff8", type: "array" }) as ArrayBuffer;
```
plus a per-layout extension at `_app.admin.asan-export.tsx:255` (`.xls` for the journal layout,
`.xlsx` for sales/purchase/bank). `bookType: "biff8"` was verified to produce a real OLE2 file
(`d0cf11e0a1b11ae1`). **Do not make this change speculatively** — 4a may be sufficient, and a wrong
container is as bad as a wrong header. Settle it with the test in §6.

### 4c. Close the blind spot that let this ship

The verification must stop reading SheetJS output with SheetJS. The assertion that would have caught
this, and would catch a regression:

```
unzip the generated .xlsx
  assert xl/sharedStrings.xml EXISTS
  assert xl/worksheets/sheet1.xml contains NO t="str"
  assert every non-numeric cell is t="s" (or t="inlineStr")
```

`test-results/asan-real-uat/validate-workbooks.mjs:153` and the seven `e2e/asan/export-*.spec.ts`
files are the sites. **Note:** a foreign parser alone is *not* sufficient — `openpyxl 3.1.5` reads
the broken file perfectly (see §7). Assert on the XML.

---

## 5. Which export to use for Asan

| # | Surface | URL | Button | Intended consumer | Asan-importable | Asan screen | Roles |
|---|---|---|---|---|---|---|---|
| 1 | فاکتورهای فروش | `/admin/asan-export` | دانلود خروجی انتخاب‌شده‌ها | Asan | **yes** | «ارسال یا دریافت اطلاعات توسط Excel ← تب فروش» (`export-sales.ts:45`) | admin, accountant |
| 2 | فاکتورهای خرید | `/admin/asan-export` | same | Asan | **yes** | «… ← تب خرید» (`export-purchase.ts:50`) | admin, accountant |
| 3 | دریافت‌ها و واریزها | `/admin/asan-export` | same | Asan | **yes** | «ورود اطلاعات تولید یا سند از فایل Excel» (`export-journal.ts:63`) | admin, accountant |
| 4 | پرداخت‌ها و برداشت‌ها | `/admin/asan-export` | same | Asan | **yes** | same | admin, accountant |
| 5 | اسناد شخص ثالث (دوبل) | `/admin/asan-export` | same | Asan | **yes** | same | admin, accountant |
| 6 | پرداخت‌های خرید و تسویه | `/admin/asan-export` | same | Asan | **yes** | same | admin, accountant |
| 7 | واریزیهای بانکی (مسیر جایگزین) | `/admin/asan-export` | same | Asan | **yes** | «ورود اطلاعات از Excel ← واریزیهای بانکی» (`export-bank-deposit.ts:54`) | admin, accountant |
| 8 | یک پیش‌فاکتور | `/sales/quotes/$quoteId` | خروجی اکسل آسان | Asan | **yes** | same as #1 (`export-single-quote.ts:23,52,88`) | admin, accountant |
| 9 | فیش‌های واریزی | `/accounting/receipts` | خروجی اکسل | **human** | no | — | admin, manager, accountant |
| 10 | فیش‌ها، «حالت خروجی: خروجی آسان» | `/accounting/receipts` | خروجی اکسل | **nobody** — always throws `AsanLayoutNotConfiguredError` (`:181`) | no | — | — |
| 11 | محصولات | `/products` | خروجی اکسل | **human** | no | — | products.view |
| 12 | لیست قیمت فروش | `/pricing/sale-lists*` | خروجی اکسل | **human** | no | — | pricing |
| 13 | دفتر اسناد *(staging only)* | `/accounting/documents` | خروجی اکسل | **human** | no | — | admin, manager, accountant |

**Decisive test** (holds cleanly across the codebase): a genuine Asan file declares a `targetScreen`
and/or calls `asan_assign_document_numbers`. Human reports use `json_to_sheet` with Persian business
headers and neither fingerprint.

**Three look-alikes to name explicitly.** **دفتر اسناد** writes a column literally called «کد آسان»
and its button says «خروجی اکسل» — it is a human register, not Asan-bound. **`/products`** has the
same «کد آسان» column trap. **`/accounting/receipts` → «خروجی آسان»** is a menu option *labelled*
Asan output that produces no file at all. Carrying an Asan code column does not make a file
importable.

> «برای ایمپورت به آسان فقط از صفحهٔ «خروجی برای آسان» زیر منوی **مدیریت** (`/admin/asan-export`) یا
> دکمهٔ «خروجی اکسل آسان» داخل صفحهٔ جزئیات هر پیش‌فاکتور استفاده کن؛ بقیهٔ دکمه‌های «خروجی اکسل» —
> در «محصولات»، «لیست‌های فروش»، «فیش‌های واریزی» و «دفتر اسناد» — حتی اگر ستونی به نام «کد آسان»
> داشته باشند، فقط برای مرور و آرشیو خودت هستند و نباید به آسان داده شوند.»

---

## 6. What cannot be verified without importing into the real Asan — and exactly what to do

**Nothing here proves Asan rejects `t="str"`.** That is an inference from the symptom pattern, not a
measurement. No parser available on this machine reproduces the failure: `openpyxl 3.1.5` reads the
broken file perfectly. Asan is the only reader whose behaviour matters and the only one we cannot
run. **One import by the owner settles it**, and it is worth doing *before* any code change so the
fix is aimed at a measured cause.

**The owner needs to do one thing. It takes five minutes.**

Two files are on the Desktop, ready:

| | File | What it is |
|---|---|---|
| **A** | `C:\Users\AFRA\Desktop\asan-receipts-2026-06-05_to_2026-09-03-selected-1.xlsx` | the export that failed on 2026-09-03 |
| **B** | `C:\Users\AFRA\Desktop\سنددوبل اسان.xls` | Asan's own template, untouched |

1. Open Asan → «ورود اطلاعات تولید یا سند از فایل Excel».
2. Import **file A**. **Screenshot the preview grid *before* confirming.**
3. Cancel. Import **file B** (Asan's own empty template) through the *same* screen.
   **Screenshot that preview too.**
4. Send both screenshots.

**What we learn.** If A shows the number column filled and every text column blank while B's headers
appear normally, `t="str"` is confirmed and fix 4a is the whole answer. If Asan refuses to open A at
all, or names the format, the container (H2/4b) is implicated and 4b is needed as well. If Asan
shows A's text correctly, then the export is not the problem and the failure is downstream of the
preview — a different investigation.

**Also worth capturing, if the dialog shows it:** any file-type filter on the browse dialog (does it
offer `*.xls` only, or `*.xls;*.xlsx`?), and any error text, verbatim. If a filter excludes `.xlsx`,
that answers 4b on its own.

**One more thing to send if it is easy:** a *filled* export from Asan for either screen — one with
real data rows, not just headers. **Both captured templates are header-only** (`A1:O1` and
`A1:F1`), so there is no template-side data row anywhere to diff against, and the data-row half of
§2 rests entirely on our own output.

> Note for whoever files these: `.gitignore:122-125` will silently refuse to commit any `.xlsx`.
> If the templates should live in the repo, that line needs an explicit exception — an owner
> decision, not made here.

---

## 7. Not verified

1. **The causal link to Asan is inferred, not measured.** No Asan software was run. `openpyxl 3.1.5`
   — a genuinely foreign reader — parses the broken file **correctly** (all text present,
   `max_col: 15`, headers intact), so the symptom was **not reproduced by any local parser**. What is
   proven is that the file deviates from both Asan templates in a specific, identified way that
   splits cells exactly along the reported line. That the deviation is what Asan chokes on remains
   the strongest available explanation, not a demonstrated fact.
2. **`سنددوبل اسان.xls` requiring BIFF is not established.** Its OLE2 signature is measured; that
   Asan *rejects* OOXML on that screen is not. §4b is conditional on §6.
3. **No data-row diff against a template exists.** Both captured templates are header-only.
4. **The templates' provenance is assumed.** They were found on the Desktop and `D:\all` and are
   byte-identical across both; nothing proves Asan produced them rather than a person.
5. **Agent 2's rebuild is not the Vite production pipeline.** Modules were copied to the scratchpad
   with `@/…` aliases rewritten to relative paths and run under `node --experimental-strip-types`.
   The byte-identity of its header row with the owner's real downloads is what establishes the
   generated bytes are the shipped bytes — a strong check, but not the browser build itself.
6. **The RPCs were never called as an authorised user.** Their bodies were replayed as `SELECT`s;
   Persian `blocked_reason` / `doc_label` strings were reduced to ASCII markers in the bank replay.
   No exported cell depends on those two columns.
7. **The proposed fixes were NOT applied and NOT tested end to end.** `bookSST: true` was verified to
   change the serialization in isolation. No build, typecheck, lint or test was run — this mission
   changed no application code. There is still **no `test` script** in this project.
8. **Secondary deviations were observed but not pursued**: uncompressed (`Stored`) zip entries, an
   invalid DOS timestamp `(1980,0,0)`, sheet name `Asan` vs the template's `Sheet1`, a stray
   `numFmtId="56"`, and the `<ignoredErrors numberStoredAsText="1"/>` trailer. Any of these could
   matter to a strict reader; none was tested.
9. **Production was never contacted**, and no data on the test database was modified.
