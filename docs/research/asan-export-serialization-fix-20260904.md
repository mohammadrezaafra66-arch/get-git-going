# Asan export serialization — fix report

**Date:** 2026-09-04 · **Host:** `VIRA-SERVICE` (test). **Production `192.168.170.10` was never contacted.**
**Verdict: PARTIAL** — both action-plan rows are closed in code with before/after evidence and a
red→green test, but Stage D (deploy + manual download from the running app) was **not performed**,
and the commit landed on `staging` instead of on a feature branch. Both are explained below.

---

## Incident first — the commit bypassed the PR flow

**What happened.** The commit is `0866cff6`, and it is on `origin/staging` directly. It was never
on `hotfix/asan-export-shared-strings`, which still points at `4fd86afc`.

The cause is the shared working tree (`CLAUDE.md`, "When several agents run at once, they share ONE
working tree"). The reflog, verbatim:

```
0866cff6 HEAD@{2026-09-04 03:25:51}: commit: fix(asan): write real shared strings, …   <- mine
469fe0a9 HEAD@{2026-09-04 03:13:29}: pull: Fast-forward
4fd86afc HEAD@{2026-09-04 03:08:59}: checkout: moving from hotfix/asan-export-shared-strings to staging
4fd86afc HEAD@{2026-09-04 03:06:45}: reset: moving to HEAD~1
deac4f34 HEAD@{2026-09-04 03:05:40}: commit: feat(accounting): bank_accounts carries its Asan code…
4fd86afc HEAD@{2026-09-04 03:04:02}: checkout: moving from staging to hotfix/asan-export-shared-strings   <- mine
```

At 03:04 I created the branch. At 03:05–03:13 **another agent**, working in the same tree,
committed onto it, reset it away, switched the tree back to `staging`, and pulled. By the time my
commit ran at 03:25, `HEAD` was `staging`. `git push origin HEAD` then went to `staging`.

**Nothing was lost, mine or theirs.**
- My commit contains exactly my seven files — verified with `git diff --name-only 0866cff6~1 0866cff6`.
  It captured none of their work.
- Their work is safe: `69ace7ca` reached `origin/staging` through PR #385, and
  `supabase/migrations/20260904150000_424_bank_account_asan_code.sql` is on disk. `deac4f34` was
  their own duplicate, reset away one minute after they made it.

**What I did not do.** No force-push, no revert, no reset — `CLAUDE.md` forbids rewriting shared
history to tidy a mis-landed commit, and the content on `staging` is correct and tested. The branch
policy violation is real and is the owner's to resolve; I am not going to compound it unilaterally.

**Consequence for the brief.** §7.3 ("Open a PR to staging. Do not merge it yourself.") can no
longer be satisfied — the change is already on `staging`. A PR now would carry an empty diff.

---

## Action-plan reconciliation

| # | Node | Action | Status | Evidence |
|---|---|---|---|---|
| 1 | String cells serialized as `t="str"` with no shared-string table | FIX | **closed** | before/after raw XML below; test red→green |
| 2 | Sheet named `Asan` instead of `Sheet1` | FIX | **closed** | before/after `<sheet name=>` below; two call sites, both fixed |

Both closed in code. Neither is confirmed *in the running app* — see NOT VERIFIED.

---

## Before / after — the same probe, both states

Probe: `scripts/scratch/asan-serialization-probe.ts`, which calls the shipped `buildAsanWorkbook`
and the shipped row builders. Dumper: `scripts/scratch/dump-xlsx.sh`. Layout `bank_deposit`, one
header row and one Persian-bearing data row.

> `buildAsanWorkbook`, not `downloadAsanWorkbook`: the latter is the same code plus a `Blob` +
> `<a download>` handoff that needs `document`, and it delegates every byte to the former
> (`write-xlsx.ts:48`). Bytes are what is under test.

### BEFORE

```
--- zip entries ---
[Content_Types].xml   _rels/.rels   docProps/app.xml   docProps/core.xml
xl/_rels/workbook.xml.rels   xl/metadata.xml   xl/styles.xml   xl/theme/theme1.xml
xl/workbook.xml   xl/worksheets/sheet1.xml
--- sharedStrings.xml present? ---
ABSENT
--- workbook.xml <sheet name=> ---
<sheet name="Asan" sheetId="1" r:id="rId1"/>
--- sheetData (raw) ---
<row r="1"><c r="A1" t="str"><v>Date</v></c><c r="B1" t="str"><v>Code_M</v></c><c r="C1" t="str"><v>Name_Moshtare</v></c><c r="D1" t="str"><v>Shopmare_Peygeri</v></c><c r="E1" t="str"><v>Mablagh</v></c><c r="F1" t="str"><v>Bank_cod</v></c><c r="G1" t="str"><v></v></c>…<c r="O1" t="str"><v></v></c></row><row r="2"><c r="A2" t="str"><v>1405/06/13</v></c><c r="B2" t="str"><v>105052</v></c><c r="C2" t="str"><v>شرکت نمونهٔ آزمایشی</v></c><c r="D2" t="str"><v>TRK-77</v></c><c r="E2"><v>2500000</v></c><c r="F2" t="str"><v>8</v></c><c r="G2" t="str"><v></v></c>…<c r="O2" t="str"><v></v></c></row>
--- t="str" occurrences: 29 ---   --- t="s" occurrences: 0 ---
```

### AFTER

```
--- zip entries ---
[Content_Types].xml   _rels/.rels   docProps/app.xml   docProps/core.xml
xl/_rels/workbook.xml.rels   xl/metadata.xml   xl/sharedStrings.xml   xl/styles.xml
xl/theme/theme1.xml   xl/workbook.xml   xl/worksheets/sheet1.xml
--- sharedStrings.xml present? ---
PRESENT
<sst count="29" uniqueCount="12"><si><t>Date</t></si><si><t>Code_M</t></si><si><t>Name_Moshtare</t></si><si><t>Shopmare_Peygeri</t></si><si><t>Mablagh</t></si><si><t>Bank_cod</t></si><si><t></t></si><si><t>1405/06/13</t></si><si><t>105052</t></si><si><t>شرکت نمونهٔ آزمایشی</t></si><si><t>TRK-77</t></si><si><t>8</t></si></sst>
--- workbook.xml <sheet name=> ---
<sheet name="Sheet1" sheetId="1" r:id="rId1"/>
--- sheetData (raw) ---
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c><c r="G1" t="s"><v>6</v></c>…<c r="O1" t="s"><v>6</v></c></row><row r="2"><c r="A2" t="s"><v>7</v></c><c r="B2" t="s"><v>8</v></c><c r="C2" t="s"><v>9</v></c><c r="D2" t="s"><v>10</v></c><c r="E2"><v>2500000</v></c><c r="F2" t="s"><v>11</v></c><c r="G2" t="s"><v>6</v></c>…<c r="O2" t="s"><v>6</v></c></row>
--- t="str" occurrences: 0 ---   --- t="s" occurrences: 29 ---
```

### The oracle, for comparison

```
docs/asan/templates/bank-deposit-template.xlsx
  <sheet name="Sheet1" …/>
  <sst count="7" uniqueCount="7"><si><t>Date</t></si>…<si><t>Bank_cod</t></si><si><t /></si></sst>
  A1..F1 t="s" -> sst[0..5];  G1..O1 t="s" -> sst[6]
```

**The after-state reproduces the oracle's structure exactly**: named headers in `sst[0..5]`, one
shared empty string reused for the whole G..O padding. The only cosmetic difference is that Asan's
template writes the empty string self-closing (`<si><t /></si>`) and SheetJS writes it as an empty
pair (`<si><t></t></si>`) — semantically identical XML.

**`Mablagh` stayed numeric**: `<c r="E2"><v>2500000</v></c>`, no `t` attribute, before and after.

**The owner's failed file matches the before-state**, confirming the diagnosis rather than assuming
it — same ten zip entries, sharedStrings ABSENT, `<sheet name="Asan"…>`, 12 × `t="str"`, and its
numeric cells bare (`<c r="E2"><v>690000000</v></c>`).

---

## Mechanism — hypothesis [H] CONFIRMED

The brief's hypothesis was that SheetJS defaults to `bookSST: false`. Tested directly against
`xlsx@0.18.5` as installed in this repo, three writes of the same sheet:

| `XLSX.write` options | `xl/sharedStrings.xml` | `t="str"` | `t="s"` |
|---|---|---|---|
| `{bookType:"xlsx", type:"buffer"}` (default) | ABSENT | 29 | 0 |
| `{…, bookSST: false}` | ABSENT | 29 | 0 |
| `{…, bookSST: true}` | **PRESENT** | **0** | **29** |

Confirmed, and numeric cells are unaffected in all three. The fix is one option:

```ts
// src/lib/asan/write-xlsx.ts:43
return XLSX.write(wb, { bookType: "xlsx", type: "array", bookSST: true }) as ArrayBuffer;
```

Why it matters: `t="str"` is the **cached formula result** type. A conforming `t="str"` cell is
accompanied by an `<f>` element; SheetJS emits none, so the cell is malformed. Excel and
LibreOffice recover from it. Asan does not — it drops the cell, which is why numbers survived and
text did not.

---

## Layout coverage — the fix is layout-agnostic

`AsanLayoutKey` has exactly four members (`layouts.ts:109`), and all seven registry exports map
onto them: `sales`, `purchase`, `bank_deposits` one each, and `receipts` / `payments` /
`third_party` / `purchase_settlement` all through `makeJournalExport` (`export-journal.ts:64`), one
`layout: "journal"`. The probe emitted every layout in both states:

| layout | BEFORE | AFTER |
|---|---|---|
| `bank_deposit` | no-SST, `t=str`:29, `t=s`:0, name=`Asan` | SST, `t=str`:0, `t=s`:29, name=`Sheet1` |
| `journal` | no-SST, `t=str`:12, `t=s`:0, name=`Asan` | SST, `t=str`:0, `t=s`:12, name=`Sheet1` |
| `sales` | no-SST, `t=str`:35, `t=s`:0, name=`Asan` | SST, `t=str`:0, `t=s`:35, name=`Sheet1` |
| `purchase` | no-SST, `t=str`:35, `t=s`:0, name=`Asan` | SST, `t=str`:0, `t=s`:35, name=`Sheet1` |

The fix is in the single shared writer, so coverage is structural, not incidental.

---

## The `.xls` vs `.xlsx` question — measured, report only, unchanged

| | Container | Evidence |
|---|---|---|
| App output, **every** layout | `.xlsx` (OOXML zip) | `bookType: "xlsx"` appears exactly once in `src/` (`write-xlsx.ts:43`); both call sites name the file `*.xlsx` |
| `bank-deposit-template.xlsx` | `.xlsx` — `50 4b 03 04` (ZIP) | file signature |
| `dual-document-template.xls` | **genuine legacy OLE2/BIFF8** — `d0 cf 11 e0 a1 b1 1a e1` | file signature; not a renamed xlsx |
| `FAILED-platform-export-sample.xlsx` | `.xlsx` — `50 4b 03 04` | file signature |

So for the bank layout the app's container matches Asan's template. **For the journal /
dual-document layout it does not**: Asan's own template there is a true `.xls`, and the app emits
`.xlsx`. Whether Asan's dual-document import rejects an `.xlsx` is **unknown** and untestable here.
Not changed, per the brief. If the owner's next import still loses the journal file specifically
while the bank file works, this is the first thing to look at.

---

## Line-number drift since `c816eea4`

**None.** Every traced location was still exact at `4fd86afc`:

| Traced | Found |
|---|---|
| `export-bank-deposit.ts:51-69` BANK_DEPOSIT_EXPORT | `:51` ✓ |
| `layouts.ts:88-104` bank headers | `:88` ✓ |
| `layouts.ts:111-116` LAYOUT_HEADERS | `:111` ✓ |
| `_app.admin.asan-export.tsx:143` headers | `:143` ✓ |
| `_app.admin.asan-export.tsx:253-256` download call | `:253` ✓ |
| `write-xlsx.ts:26-34` build | `:26-34` ✓ |

**One thing the brief's trace missed**, found by content search: a **second production call site**,
`src/lib/asan/export-single-quote.ts:87`, also passed `sheetName: "Asan"`.

---

## The test

`e2e/asan/og99-…spec.ts` extended (not duplicated) with two new describes, plus a new
dependency-free zip reader at `e2e/helpers/xlsx-raw.ts`.

- Reads **raw XML out of the zip**, never through `XLSX.read` — which reports a `t="str"` cell as
  `t: "s"` and is precisely why the original spec passed against broken output.
- No new dependency: `fflate` is present but only transitively via `jspdf`; the helper uses Node's
  own `zlib.inflateRawSync`.
- `og99`'s existing `roundTrip` was changed to stop passing `sheetName: "Sheet1"` itself, so it now
  exercises production's default.

**Red → green, proven:**

```
RED  (fix reverted):  4 failed, 8 passed
  ✗ xl/sharedStrings.xml exists and carries the six header strings
  ✗ no cell anywhere is t="str"
  ✗ src/routes/_app.admin.asan-export.tsx calls the writer without a sheetName
  ✗ src/lib/asan/export-single-quote.ts calls the writer without a sheetName
GREEN (fix restored): 12 passed (1.5s)
```

The revert/restore round-trip was verified byte-exact with `md5sum -c`.

**Honest limitation on the sheet-name half.** The runtime test proves the *writer's default* is
`Sheet1` — but that default was already correct before this fix; the defect was that both call
sites overrode it. Neither call site is reachable from a unit test (one is inside a React route,
the other needs a live Supabase query), so that half is pinned by a **source assertion** that reads
the two files and fails if a `sheetName:` property reappears. Weaker than behavioural, and labelled
as such in the spec.

---

## Regression check

**Full `e2e/asan/` suite: 15 failed, 168 passed, 22 skipped.**
All 15 failures are **pre-existing**, not caused by this change. Established by re-running the same
seven spec files against the reverted code: **identical 15 failures, same test names.** They are
data-dependent ("today every purchase is blocked", "the one posted entry on this database", "the
three collisions the research predicted are queued") — the shared-database drift `CLAUDE.md` §7
warns about — plus two page-level `toBeVisible` failures.

**`npm run typecheck`: exactly 70 errors across 6 files** — the documented baseline, none of them
in a file this change touches. Run twice; the second run was clean of any overlap with the
revert experiment.

---

## Deviations from the brief

1. **Fixed a second call site.** The brief named only the route. `export-single-quote.ts:87` had the
   same `sheetName: "Asan"` override. Fixing one and not the other would have left the single
   pre-invoice export still disagreeing with the template, which contradicts owner decision [U]
   ("every export the platform produces must be importable"). Row 2 is about the defect, not about
   one line.
2. **Stage D not performed.** Reasons in NOT VERIFIED.
3. **Committed to `staging`, not to a feature branch.** Not a choice — see the incident section.
4. **Left four e2e specs alone** that still build fixtures with `sheetName: "Asan"`
   (`export-preinvoice`, `export-purchase`, `export-sales`, `final-verification`). None asserts the
   sheet name, so all still pass, but they now build with a name production no longer uses.
   Cosmetic divergence; changing them is outside the two action-plan rows. Recommended follow-up.

---

## NOT VERIFIED

- **Whether Asan actually accepts the produced file. Only the owner importing one can settle that.**
  Everything here shows the file now matches the structure of Asan's own template. It does not show
  that Asan is happy, and no test in this repo can.
- **Stage D was not run.** The container currently serves `APP_GIT_SHA=469fe0a9`, built 03:13:48 by
  another agent — one commit *before* this fix. So **the fix is not deployed** and no file produced
  by the running app has been inspected. I stopped rather than building because another agent had
  switched this shared tree twenty minutes earlier; a `docker compose build` reads the working tree
  for several minutes, and a switch mid-build would produce an image whose `APP_GIT_SHA` lies —
  exactly the hazard §7.2 exists to prevent.
- **The `.xls` container question for the journal layout** (above).
- **Production.** Never contacted, entirely out of scope.

---

## What the owner needs to decide

1. **The `staging` commit.** `0866cff6` is on `staging` without a PR. Leave it, or revert it there
   and re-land it through a PR? I will not rewrite shared history without an explicit instruction.
2. **The deploy.** Rebuild `web` at `0866cff6` when the tree is quiet, then download a real export
   from `/admin/asan-export` and check the raw XML. My recommended command adds `--no-deps`, which
   the brief's command omits — `CLAUDE.md` records that omitting it takes the app **down**, because
   `db-role-fix` cannot start through the Docker Desktop mount bug:

   ```powershell
   $env:DISABLE_LOVABLE_MCP="1"
   $env:GIT_SHA = (git rev-parse --short HEAD)
   $env:BUILD_TIME = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
   docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml `
     up -d --no-deps --build web
   ```
3. **Then import one file into Asan** and say whether the text survives. That is the only test that
   closes this.
