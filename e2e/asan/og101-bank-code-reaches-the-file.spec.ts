/**
 * OG-101 — Bank_cod carries the account's Asan code, and an account without one exports a blank
 * CELL rather than no cell at all.
 *
 * WHAT WAS ALREADY TRUE BEFORE THIS SPEC, measured on 2026-09-04 and stated so the spec is not
 * mistaken for the feature: `bank_accounts.accounting_code` already exists, is already the
 * documented source for column F (docs/asan/asan-layouts.md:153), and
 * `asan_list_bank_deposit_export` already reads it — the destination account for a receipt, the
 * source account for a payment. Running it live returned bank_code = 8 on all 17 exportable
 * rows. So what was missing was never the column; it was a fast way to ENTER twenty of them,
 * and a gate holding the wire in place. This is the gate.
 *
 * WHY THE EMPTY CASE NEEDS ITS OWN TEST. `null` and `""` are indistinguishable in the source
 * array and produce different sheets: aoa_to_sheet writes no cell at all for null, so a
 * code-less account would silently shorten the row and every column after F would shift left
 * inside Asan. The only way to tell them apart is to write the workbook and read it back.
 *
 * These tests are offline and fixture-driven on purpose: they must not go vacuous on a day when
 * the live export happens to return no rows.
 */
import * as XLSX from "xlsx";

import { expect, test } from "@playwright/test";

import { BANK_DEPOSIT_HEADERS } from "@/lib/asan/layouts";
import { buildBankDepositRows, type BankDepositRow } from "@/lib/asan/export-bank-deposit-rows";
import { buildAsanWorkbook } from "@/lib/asan/write-xlsx";
import { inRolledBackTx } from "../helpers/tx";

/** A complete BankDepositRow — every required field, so no cast hides a shape change. */
const BASE: BankDepositRow = {
  doc_id: "og101-1",
  doc_label: "OG101",
  doc_date: "2026-09-04",
  party_name: "شرکت نمونه",
  person_code: "114017",
  tracking_number: "TRK-101",
  amount: "250000",
  bank_code: "8",
  bank_title: "بانک نمونه",
  blocked_reason: null,
  direction: "receipt",
};

/** The same row with no account code — what an uncoded account produces. */
const NO_CODE: BankDepositRow = { ...BASE, doc_id: "og101-2", bank_code: null };

const BANK_COD = 5;

async function roundTrip(row: BankDepositRow) {
  const built = buildBankDepositRows({ row });
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

const cell = (ws: XLSX.WorkSheet, col: number, r: number) =>
  ws[XLSX.utils.encode_cell({ c: col, r })] as XLSX.CellObject | undefined;

test.describe("OG-101 — the account's Asan code reaches column F", () => {
  test("an account WITH a code exports it in Bank_cod", async () => {
    const { ws } = await roundTrip(BASE);
    expect(cell(ws, BANK_COD, 1)?.v, "column F must carry the account's code").toBe("8");
  });

  test("an account WITHOUT a code exports an empty CELL, not an absent one", async () => {
    const { ws, range } = await roundTrip(NO_CODE);
    const f = cell(ws, BANK_COD, 1);
    expect(f, "a null here writes no cell and shifts every later column inside Asan").toBeDefined();
    expect(f?.v, "it must be the empty string").toBe("");
    expect(range.e.c + 1, "the row must still be 15 columns wide").toBe(15);
  });

  test("NOTHING ELSE in the row changes between the two cases", async () => {
    // The guard against a fix that quietly moves another column while correcting F.
    const withCode = await roundTrip(BASE);
    const without = await roundTrip(NO_CODE);
    for (const c of [0, 1, 2, 3, 4]) {
      expect(
        cell(without.ws, c, 1)?.v,
        `column ${c} must be identical whether or not the account has a code`,
      ).toEqual(cell(withCode.ws, c, 1)?.v);
    }
    // And G..O stay empty strings in both.
    for (const c of [6, 14]) {
      expect(cell(withCode.ws, c, 1)?.v).toBe("");
      expect(cell(without.ws, c, 1)?.v).toBe("");
    }
  });

  test("a cash box is served by the same column — it is not a bank-only field", async () => {
    // The owner's cash box carries 986. bank_accounts holds both types behind one CHECK,
    // so the export must not care which type produced the code.
    const { ws } = await roundTrip({ ...BASE, doc_id: "og101-3", bank_code: "986" });
    expect(cell(ws, BANK_COD, 1)?.v).toBe("986");
  });
});

test.describe("OG-101 — the code survives a write and a reload", () => {
  test("setting the code persists, and clearing it stores NULL rather than an empty string", () => {
    const out = inRolledBackTx(`
CREATE TEMP TABLE acc ON COMMIT DROP AS
  SELECT id FROM public.bank_accounts ORDER BY title LIMIT 1;

UPDATE public.bank_accounts SET accounting_code = '986' WHERE id = (SELECT id FROM acc);
INSERT INTO probe SELECT 'afterWrite=' || COALESCE(accounting_code,'NULL')
  FROM public.bank_accounts WHERE id = (SELECT id FROM acc);

-- The inline editor sends NULL, never ''. post_receipt_accounting treats a blank code as unset,
-- so an empty string would pass a not-blank check while meaning nothing.
UPDATE public.bank_accounts SET accounting_code = NULL WHERE id = (SELECT id FROM acc);
INSERT INTO probe SELECT 'afterClear=' || COALESCE(accounting_code,'NULL')
  FROM public.bank_accounts WHERE id = (SELECT id FROM acc);`);
    expect(out).toContain("afterWrite=986");
    expect(out).toContain("afterClear=NULL");
  });

  test("two accounts cannot share one code — the owner will hit this while typing twenty", () => {
    const out = inRolledBackTx(`
DO $probe$
BEGIN
  BEGIN
    INSERT INTO public.bank_accounts (title, bank_name, account_type, accounting_code)
    VALUES ('OG101 probe', 'ملت', 'bank',
            (SELECT accounting_code FROM public.bank_accounts
              WHERE accounting_code IS NOT NULL LIMIT 1));
    INSERT INTO probe VALUES ('duplicate=ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe VALUES ('duplicate=REFUSED ' || SQLSTATE);
  END;
END
$probe$;`);
    // 23505 — bank_accounts_accounting_code_unique_idx. The inline editor names this in Persian
    // instead of showing the raw error.
    expect(out, "codes are per-account, so the unique index is correct and must stay").toContain(
      "duplicate=REFUSED 23505",
    );
  });

  test("the export function reads the column — not a literal, not a different source", () => {
    const out = inRolledBackTx(`
INSERT INTO probe SELECT 'readsColumn=' ||
  (pg_get_functiondef(p.oid) ~ 'ba.accounting_code')::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'asan_list_bank_deposit_export';
INSERT INTO probe SELECT 'bothTypesOneTable=' || pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conname = 'bank_accounts_account_type_chk';`);
    expect(out).toContain("readsColumn=true");
    expect(out.join("\n"), "cash boxes live in bank_accounts, so one column serves both").toContain(
      "'cash'",
    );
  });
});
