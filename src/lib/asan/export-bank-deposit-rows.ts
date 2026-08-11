/**
 * ASAN M4.7 — the bank-deposit row mapping (`واریزیهای بانکی`, Layout 4).
 *
 * Split from `export-bank-deposit.ts` for the same reason as the invoice and journal mappings:
 * the data access imports the Supabase browser client, which reads `import.meta.env` and cannot
 * load outside a Vite build. Keeping the mapping free of it lets the phase test assert **the
 * shipped mapping** rather than a retyped copy.
 *
 * Unlike the invoice layouts this is one row per **document** — a deposit has no line items.
 */
import { tomanStringToRial } from "@/lib/asan/amounts";
import { isoToJalaliAsan } from "@/lib/asan/dates";
import type { AsanCell, AsanExportDocument } from "@/lib/asan/export-types";

export interface BankDepositRow {
  doc_id: string;
  doc_label: string | null;
  doc_date: string | null;
  party_name: string | null;
  person_code: string | null;
  tracking_number: string | null;
  amount: string | number | null;
  bank_code: string | null;
  bank_title: string | null;
  blocked_reason: string | null;
}

export interface BankDepositPayload {
  row: BankDepositRow;
}

/** One sheet row per deposit, in the exact order of `BANK_DEPOSIT_HEADERS`. */
export function buildBankDepositRows(payload: BankDepositPayload): AsanCell[][] {
  const r = payload.row;
  return [
    [
      isoToJalaliAsan(r.doc_date), // A Date
      r.person_code ?? "", // B Code_M
      r.party_name ?? "", // C Name_Moshtari
      r.tracking_number ?? "", // D Shomare_Peygiri
      tomanStringToRial(r.amount), // E Mablagh — Toman x10
      r.bank_code ?? "", // F Bank_cod
    ],
  ];
}

export function groupBankDepositRows(rows: BankDepositRow[]): AsanExportDocument[] {
  return rows.map((r) => ({
    sourceId: r.doc_id,
    title: r.doc_label ?? r.doc_id,
    dateIso: r.doc_date ?? "",
    partyName: r.party_name ?? "",
    totalToman: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    rowCount: 1,
    // No numbering register for this layout, so there is nothing to display.
    asanNumber: null,
    blockedReason: r.blocked_reason,
    payload: { row: r } satisfies BankDepositPayload,
  }));
}
