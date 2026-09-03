/**
 * OG-99 — the bank export's header row and cell types, measured by writing a real file and
 * reading it back.
 *
 * WHY BY ROUND-TRIP AND NOT BY READING THE SOURCE. Asan maps columns by HEADER NAME. If a header
 * is off by one character every text column lands in the wrong place or is dropped, and the
 * failure is invisible in the produced file — it only shows up inside Asan. Equally, `null`
 * padding and `""` padding look identical in the source array but produce different sheets:
 * aoa_to_sheet writes no cell at all for null, so the sheet comes out six columns wide instead of
 * fifteen. Neither property is visible without generating the workbook and parsing it back.
 *
 * WHAT THE SPEC SAYS (OG-35). Headers, byte-exact and in this order:
 *   Date | Code_M | Name_Moshtare | Shopmare_Peygeri | Mablagh | Bank_cod
 * "Shopmare" is misspelled in the real Asan template and the misspelling is deliberate — a header
 * that merely looks right imports into the wrong column of live accounting software. G..O must be
 * empty-string cells. Date is a Jalali string with slashes, not a date serial. Mablagh is a number
 * in rials, negative for payments.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as XLSX from "xlsx";

import { expect, test } from "@playwright/test";

import { BANK_DEPOSIT_HEADERS } from "@/lib/asan/layouts";
import { buildBankDepositRows, type BankDepositRow } from "@/lib/asan/export-bank-deposit-rows";
import { buildAsanWorkbook } from "@/lib/asan/write-xlsx";
import {
  cellText,
  firstSheetName,
  rawCell,
  sharedStrings,
  sheetDataXml,
} from "../helpers/xlsx-raw";

/** The six named headers, exactly as the Asan template holds them — misspelling included. */
const REQUIRED_HEADERS = [
  "Date",
  "Code_M",
  "Name_Moshtare",
  "Shopmare_Peygeri",
  "Mablagh",
  "Bank_cod",
] as const;

const RECEIPT: BankDepositRow = {
  id: "r-1",
  doc_date: "2026-09-04",
  person_code: "1001",
  party_name: "شرکت نمونه",
  tracking_number: "TRK-77",
  amount: "250000",
  bank_code: "12",
  direction: "receipt",
} as BankDepositRow;

const PAYMENT: BankDepositRow = { ...RECEIPT, id: "p-1", direction: "payment" } as BankDepositRow;

/** Generate the workbook the app would generate, then parse it back. */
async function roundTrip(rows: BankDepositRow[]) {
  const { ws, range } = await readBack(await build(rows));
  return { ws, range };
}

/**
 * Build the bytes exactly as production does.
 *
 * NO `sheetName` ARGUMENT, deliberately. Both production call sites — the batch export in
 * `_app.admin.asan-export.tsx` and the single pre-invoice in `export-single-quote.ts` — now omit
 * it so `write-xlsx`'s `"Sheet1"` default applies. This helper used to pass `sheetName: "Sheet1"`
 * itself, which meant the route's old hardcoded `"Asan"` was never exercised by any test and the
 * mismatch with the template shipped unnoticed. Passing anything here would restore that blind
 * spot.
 */
async function build(rows: BankDepositRow[]): Promise<Buffer> {
  // The same two modules the app uses: the row builder decides cell VALUES and TYPES, the
  // workbook builder decides whether a cell exists at all.
  const built = rows.flatMap((row) => buildBankDepositRows({ row } as never));
  const buf = await buildAsanWorkbook({ headers: BANK_DEPOSIT_HEADERS, rows: built });
  return Buffer.from(buf);
}

function readBack(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  return { ws, range };
}

const cell = (ws: XLSX.WorkSheet, col: number, row: number) =>
  ws[XLSX.utils.encode_cell({ c: col, r: row })] as XLSX.CellObject | undefined;

test.describe("OG-99 — the produced file matches the Asan template contract", () => {
  test("the header row is the six template strings, byte for byte", async () => {
    const { ws } = await roundTrip([RECEIPT]);
    const actual = REQUIRED_HEADERS.map((_, i) => cell(ws, i, 0)?.v);
    expect(actual, "Asan maps by header NAME — one wrong character drops the column").toEqual([
      ...REQUIRED_HEADERS,
    ]);
  });

  test("the misspelling is reproduced, not corrected", async () => {
    // Stated separately so a failure names the trap rather than showing an array diff.
    const { ws } = await roundTrip([RECEIPT]);
    expect(cell(ws, 3, 0)?.v, 'column D must be "Shopmare_Peygeri", not "Shomare_Peygiri"').toBe(
      "Shopmare_Peygeri",
    );
    expect(cell(ws, 2, 0)?.v, 'column C must be "Name_Moshtare", not "Name_Moshtari"').toBe(
      "Name_Moshtare",
    );
  });

  test("G..O exist as empty-string cells, not as absent cells", async () => {
    // null padding and "" padding are indistinguishable in the source array and produce different
    // sheets. This is the only way to tell them apart.
    const { ws, range } = await roundTrip([RECEIPT]);
    expect(range.e.c + 1, "the sheet must be 15 columns wide, like the template").toBe(15);
    for (let c = 6; c <= 14; c += 1) {
      const header = cell(ws, c, 0);
      expect(header, `header column ${c} must exist as a cell`).toBeDefined();
      expect(header?.v, `header column ${c} must be an empty string`).toBe("");
      const body = cell(ws, c, 1);
      expect(body, `body column ${c} must exist as a cell`).toBeDefined();
      expect(body?.v, `body column ${c} must be an empty string`).toBe("");
    }
  });

  test("Date is a text cell holding a slashed Jalali date, not a serial", async () => {
    const { ws } = await roundTrip([RECEIPT]);
    const date = cell(ws, 0, 1);
    expect(date?.t, "a date serial would be type n and Asan would read it as a number").toBe("s");
    expect(String(date?.v), "shape must be YYYY/MM/DD").toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });

  test("Mablagh is a number in rials, and negative for a payment", async () => {
    const { ws } = await roundTrip([RECEIPT, PAYMENT]);
    const receipt = cell(ws, 4, 1);
    const payment = cell(ws, 4, 2);
    expect(receipt?.t, "Mablagh must be numeric, not text").toBe("n");
    expect(payment?.t, "Mablagh must be numeric, not text").toBe("n");
    // 250000 Toman -> 2500000 rials.
    expect(receipt?.v, "Toman must be multiplied by ten").toBe(2_500_000);
    expect(payment?.v, "a payment is the same magnitude, negated").toBe(-2_500_000);
  });
});

/* ------------------------------------------------------------------------------------------- *
 * OG-102 — the SERIALIZATION contract, asserted on the raw XML inside the zip.
 *
 * WHY A SECOND BLOCK RATHER THAN MORE ASSERTIONS ABOVE. Every test above reads through
 * `XLSX.read`, which reports a malformed `t="str"` cell as `t: "s"` — the exact normalisation that
 * let the defect ship. These tests must therefore never touch SheetJS on the read side. They walk
 * the zip themselves (`e2e/helpers/xlsx-raw.ts`) and compare bytes.
 *
 * THE DEFECT THEY PIN. Without `bookSST: true`, SheetJS writes every string cell as
 * `<c t="str"><v>…</v></c>` — the cached-formula-result type, with no `<f>` and no
 * `xl/sharedStrings.xml` anywhere in the archive. Asan drops those cells on import and keeps only
 * the bare numbers. `docs/asan/templates/FAILED-platform-export-sample.xlsx` is a real file
 * produced that way, and the owner's report of it was "only the number columns survive".
 * ------------------------------------------------------------------------------------------- */

const TEMPLATE = resolve(process.cwd(), "docs/asan/templates/bank-deposit-template.xlsx");

test.describe("OG-102 — the file serialises the way Asan's own template does", () => {
  test("xl/sharedStrings.xml exists and carries the six header strings", async () => {
    const zip = await build([RECEIPT]);
    const sst = sharedStrings(zip);
    expect(sst, "no sharedStrings.xml means every text cell was written as t=\"str\"").not.toBeNull();
    for (const h of REQUIRED_HEADERS) {
      expect(sst, `header "${h}" must be in the shared-string table`).toContain(h);
    }
    // The G..O padding is one shared empty string, exactly as the template stores it.
    expect(sst, "the empty padding string must be in the table too").toContain("");
  });

  test("no cell anywhere is t=\"str\"", async () => {
    const zip = await build([RECEIPT, PAYMENT]);
    const data = sheetDataXml(zip);
    const offenders = data.match(/t="str"/g) ?? [];
    expect(
      offenders.length,
      't="str" is the cached-formula-result type; Asan discards those cells on import',
    ).toBe(0);
    // And the positive half: the text cells really are shared-string cells.
    expect((data.match(/t="s"/g) ?? []).length).toBeGreaterThan(0);
  });

  test("the sheet is named Sheet1, like both real Asan templates", async () => {
    const zip = await build([RECEIPT]);
    expect(firstSheetName(zip)).toBe("Sheet1");
    // The oracle agrees — read it rather than trusting the literal above.
    expect(firstSheetName(readFileSync(TEMPLATE))).toBe("Sheet1");
  });

  test("the 15-column header row still matches the template cell for cell", async () => {
    const zip = await build([RECEIPT]);
    const data = sheetDataXml(zip);
    const tplZip = readFileSync(TEMPLATE);
    const tplData = sheetDataXml(tplZip);

    for (let c = 0; c < 15; c += 1) {
      const ref = `${XLSX.utils.encode_col(c)}1`;
      const produced = cellText(zip, data, ref);
      const expected = cellText(tplZip, tplData, ref);
      expect(produced, `header cell ${ref} must equal the template's`).toBe(expected);
    }
    // Stated separately so a failure names the trap instead of showing an array diff. Asan maps by
    // header NAME and both of these are misspelled in its own template on purpose.
    expect(cellText(zip, data, "C1")).toBe("Name_Moshtare");
    expect(cellText(zip, data, "D1")).toBe("Shopmare_Peygeri");
  });

  test("Mablagh is still a bare numeric cell, not a shared string", async () => {
    const zip = await build([RECEIPT, PAYMENT]);
    const data = sheetDataXml(zip);
    const receipt = rawCell(data, "E2");
    const payment = rawCell(data, "E3");
    // A numeric cell carries NO t attribute at all. If bookSST ever stringified numbers, Asan
    // would stop summing the column.
    expect(receipt?.t, "Mablagh must have no t attribute").toBeNull();
    expect(payment?.t, "Mablagh must have no t attribute").toBeNull();
    expect(receipt?.v).toBe("2500000");
    expect(payment?.v).toBe("-2500000");
  });
});

/**
 * The call-site half of the sheet-name contract.
 *
 * HONEST ABOUT WHAT THIS IS: a source assertion, which is weaker than a behavioural one, and the
 * only kind available here. The runtime test above proves `write-xlsx`'s DEFAULT is `Sheet1` — but
 * that default was already correct before this fix. The defect was that both production call sites
 * passed `sheetName: "Asan"` and overrode it, and neither call site is reachable from a unit test:
 * one is inside a React route component, the other needs a live Supabase query.
 *
 * So this reads the two files and asserts the override is absent. It fails the moment somebody
 * reintroduces one, which is the property worth protecting.
 */
test.describe("OG-102 — no production call site overrides the sheet name", () => {
  const CALL_SITES = [
    "src/routes/_app.admin.asan-export.tsx",
    "src/lib/asan/export-single-quote.ts",
  ];

  for (const rel of CALL_SITES) {
    test(`${rel} calls the writer without a sheetName`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src, `${rel} must call the shared writer`).toContain("downloadAsanWorkbook(");
      // Comments mentioning the word are fine; an actual `sheetName:` property is not.
      const withoutComments = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(
        withoutComments,
        'both real Asan templates name the sheet "Sheet1"; let write-xlsx default to it',
      ).not.toMatch(/\bsheetName\s*:/);
    });
  }
});
