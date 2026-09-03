/**
 * Asan export serialization probe — Stage A / Stage B evidence.
 *
 * Calls the SHIPPED writer (`buildAsanWorkbook` from src/lib/asan/write-xlsx.ts) and the SHIPPED
 * row builder, with exactly the arguments the batch-export route passes, and dumps the raw XML out
 * of the resulting zip.
 *
 * Why buildAsanWorkbook and not downloadAsanWorkbook: downloadAsanWorkbook is the same code path
 * plus a Blob + <a download> handoff that needs `document`. It delegates every byte to
 * buildAsanWorkbook (write-xlsx.ts:38). Bytes are what is under test, so this probe calls the byte
 * half directly rather than shimming a DOM.
 *
 * Nothing here is imported by the app. Run:
 *   npx --yes tsx scripts/scratch/asan-serialization-probe.ts <outdir> [sheetNameOverride]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildAsanWorkbook } from "@/lib/asan/write-xlsx";
import { LAYOUT_HEADERS, type AsanLayoutKey } from "@/lib/asan/layouts";
import { buildBankDepositRows, type BankDepositRow } from "@/lib/asan/export-bank-deposit-rows";
import { buildJournalRows } from "@/lib/asan/export-journal-rows";
import type { AsanCell } from "@/lib/asan/export-types";

const outDir = resolve(process.argv[2] ?? "./probe-out");
/** undefined => omit the key entirely, which is what removing the override does. */
const sheetOverride = process.argv[3] === "OMIT" ? undefined : (process.argv[3] ?? "Asan");

mkdirSync(outDir, { recursive: true });

/** A Persian-bearing bank row — the exact shape asan_list_bank_deposit_export yields. */
const BANK_ROW = {
  doc_id: "r-1",
  doc_label: null,
  doc_date: "2026-09-04",
  party_name: "شرکت نمونهٔ آزمایشی",
  person_code: "105052",
  tracking_number: "TRK-77",
  amount: "250000",
  bank_code: "8",
  bank_title: "ملت",
  blocked_reason: null,
  direction: "receipt",
} as unknown as BankDepositRow;

async function emit(name: string, headers: readonly string[], rows: AsanCell[][]) {
  const bytes = await buildAsanWorkbook(
    sheetOverride === undefined
      ? { headers, rows }
      : { headers, rows, sheetName: sheetOverride },
  );
  const p = resolve(outDir, `${name}.xlsx`);
  writeFileSync(p, Buffer.from(bytes));
  console.log(`wrote ${p}  (${Buffer.from(bytes).length} bytes)  sheetName=${sheetOverride ?? "(omitted -> writer default)"}`);
}

async function main() {
  await emit("bank_deposit", LAYOUT_HEADERS.bank_deposit, buildBankDepositRows({ row: BANK_ROW }));

  // Every other layout in the registry, so the fix can be shown layout-agnostic.
  // Payload shape per export-journal-rows.ts:81-93 — one non-zero side per line.
  const journalPayload = {
    lines: [
      {
        line_no: 1,
        account_code: "8",
        product_code: null,
        line_description: "واریز به حساب بانکی شرکت",
        quantity: null,
        debit: "250000",
        credit: null,
      },
      {
        line_no: 2,
        account_code: "102012",
        product_code: null,
        line_description: "افزایش اعتبار / کاهش بدهی مشتری",
        quantity: null,
        debit: null,
        credit: "250000",
      },
    ],
  };
  await emit("journal", LAYOUT_HEADERS.journal, buildJournalRows(journalPayload as never));

  for (const key of ["sales", "purchase"] as AsanLayoutKey[]) {
    const width = LAYOUT_HEADERS[key].length;
    const row: AsanCell[] = Array.from({ length: width }, (_, i) => (i === 5 ? 3 : ""));
    row[0] = "۱۰۰۱";
    row[4] = "کالای آزمایشی";
    await emit(key, LAYOUT_HEADERS[key], [row]);
  }
}

void main();
