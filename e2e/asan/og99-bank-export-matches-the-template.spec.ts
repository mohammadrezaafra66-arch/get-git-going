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
import * as XLSX from "xlsx";

import { expect, test } from "@playwright/test";

import { BANK_DEPOSIT_HEADERS } from "@/lib/asan/layouts";
import { buildBankDepositRows, type BankDepositRow } from "@/lib/asan/export-bank-deposit-rows";
import { buildAsanWorkbook } from "@/lib/asan/write-xlsx";

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
  // The same two modules the app uses: the row builder decides cell VALUES and TYPES, the
  // workbook builder decides whether a cell exists at all.
  const built = rows.flatMap((row) => buildBankDepositRows({ row } as never));
  const buf = await buildAsanWorkbook({
    headers: BANK_DEPOSIT_HEADERS,
    rows: built,
    sheetName: "Sheet1",
  });
  const wb = XLSX.read(buf, { type: "array" });
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
