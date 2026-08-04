/**
 * ASAN M4.5 — the accounting-document row mapping, shared by exports 3, 4 and 5.
 *
 * Receipts (`دریافت · واریز`), payments (`پرداخت · برداشت`) and third-party documents (`دوبل`)
 * are the **same six columns**. They differ only in which documents they select, so there is one
 * builder here and each export is a filter. Three mappers for six identical columns is the
 * parallel implementation rule 14 forbids — and `export-journal.spec.ts` asserts the sharing is
 * real by driving all three through this function and requiring identical output for identical
 * input.
 *
 * Free of the Supabase import on purpose (`import.meta.env` cannot resolve outside a Vite build),
 * so the phase test exercises the shipped mapping rather than a retyped copy.
 */
import { tomanStringToRial } from "@/lib/asan/amounts";
import type { AsanCell, AsanExportDocument } from "@/lib/asan/export-types";

/** One row of `asan_list_journal_export`, as PostgREST serialises it. */
export interface JournalExportRow {
  doc_id: string;
  doc_label: string | null;
  doc_date: string | null;
  doc_kind: string | null;
  party_name: string | null;
  blocked_reason: string | null;
  line_no: number | null;
  account_code: string | null;
  product_code: string | null;
  line_description: string | null;
  quantity: string | number | null;
  debit: string | number | null;
  credit: string | number | null;
  doc_debit: string | number | null;
  doc_credit: string | number | null;
}

export interface JournalExportPayload {
  lines: JournalExportRow[];
}

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Debit and credit in Rial, with a zero written as an **empty cell** rather than `0`.
 *
 * That is not cosmetic here. Asan's dialog checks `بدون مبلغ حذف شود` by default, so it drops
 * zero-amount rows on import. Every journal line has exactly one non-zero side —
 * `journal_lines_one_side` CHECKs it — so writing the zero side as empty means our file and
 * Asan's import agree about which rows exist, and the balance holds on both sides.
 */
const amountCell = (v: string | number | null | undefined): number | null => {
  const rial = tomanStringToRial(v ?? null);
  return rial === null || rial === 0 ? null : rial;
};

/**
 * Build the six-column rows for one accounting document.
 *
 * | Col | Header    | Source                                                        |
 * |-----|-----------|---------------------------------------------------------------|
 * | A   | کد حساب   | the resolved Asan account code — a document with any           |
 * |     |           | unresolvable line never reaches here, it is blocked whole      |
 * | B   | کد کالا   | empty: a financial line carries no product                     |
 * | C   | شرح       | the line's own description                                     |
 * | D   | تعداد     | empty: a financial line has no quantity                        |
 * | E   | بدهکار    | debit, Toman × 10                                              |
 * | F   | بستانکار  | credit, Toman × 10                                             |
 *
 * `شماره سند` is **not** a column — Asan takes it on the screen, which is why a file may hold
 * exactly one document. The shell enforces that through `oneDocumentPerFile`.
 */
export function buildJournalRows(payload: JournalExportPayload): AsanCell[][] {
  return payload.lines
    .filter((r) => r.line_no !== null)
    .map((r) => [
      r.account_code ?? "", // A کد حساب
      r.product_code ?? "", // B کد کالا
      r.line_description ?? "", // C شرح
      num(r.quantity), // D تعداد
      amountCell(r.debit), // E بدهکار
      amountCell(r.credit), // F بستانکار
    ]);
}

/** Group the flat line rows into documents, preserving the source query's order. */
export function groupJournalRows(
  rows: JournalExportRow[],
  numbers: Map<string, number>,
): AsanExportDocument[] {
  const byDoc = new Map<string, JournalExportRow[]>();
  for (const r of rows) {
    const list = byDoc.get(r.doc_id);
    if (list) list.push(r);
    else byDoc.set(r.doc_id, [r]);
  }

  return [...byDoc.entries()].map(([docId, lines]) => {
    const head = lines[0];
    const real = lines.filter((l) => l.line_no !== null);
    return {
      sourceId: docId,
      title: head.doc_label ?? docId,
      dateIso: head.doc_date ?? "",
      partyName: head.party_name ?? "",
      // The document total shown to the accountant is its debit side; for a balanced document
      // that equals the credit side, and an unbalanced one is blocked before it can be exported.
      totalToman: num(head.doc_debit),
      rowCount: real.length,
      asanNumber: numbers.get(docId) ?? null,
      blockedReason: head.blocked_reason,
      payload: { lines } satisfies JournalExportPayload,
    };
  });
}
