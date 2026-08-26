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
import { BANK_DEPOSIT_HEADERS } from "@/lib/asan/layouts";
import { isoToJalaliAsan } from "@/lib/asan/dates";
import type { AsanCell, AsanExportDocument } from "@/lib/asan/export-types";

/**
 * Which way the money moved. The BANK file carries direction in the **sign of the single
 * `Mablagh` column** — a receipt is plain positive, a payment is negative.
 *
 * This is specific to layout 4 and must never be copied into the accounting document
 * (layout 3, `سنددوبل`), which carries direction in **separate `بدهکار` / `بستانکار`
 * columns**. A negative number in that file would corrupt double-entry rather than express
 * a direction.
 */
export type BankFlowDirection = "receipt" | "payment";

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
  /**
   * Absent means `receipt`. The only data source wired today
   * (`asan_list_bank_deposit_export`) reads `payment_receipts` and supplies no direction, so
   * every row it produces is a receipt — which is why the default is the safe one.
   */
  direction?: BankFlowDirection | null;
}

export interface BankDepositPayload {
  row: BankDepositRow;
}

/**
 * `Mablagh` for one row: Toman × 10, negated for a payment.
 *
 * The minus lands on the left because the cell is written as a real **number**, not a
 * string — `write-xlsx` is explicit that a formatted string is not summable in Excel. Zero
 * is left as zero: `-0` is a real IEEE-754 value and would serialise as `-0`.
 */
function mablaghFor(amount: string | number | null | undefined, direction: BankFlowDirection) {
  const rial = tomanStringToRial(amount);
  if (rial === null || direction !== "payment" || rial === 0) return rial;
  return -rial;
}

/** One sheet row per document, in the exact order and WIDTH of `BANK_DEPOSIT_HEADERS`. */
export function buildBankDepositRows(payload: BankDepositPayload): AsanCell[][] {
  const r = payload.row;
  const direction: BankFlowDirection = r.direction === "payment" ? "payment" : "receipt";
  const named: AsanCell[] = [
    isoToJalaliAsan(r.doc_date), // A Date
    r.person_code ?? "", // B Code_M
    r.party_name ?? "", // C Name_Moshtare
    r.tracking_number ?? "", // D Shopmare_Peygeri
    mablaghFor(r.amount, direction), // E Mablagh — Toman x10, negative for a payment
    r.bank_code ?? "", // F Bank_cod
  ];
  // G–O: empty STRINGS, matching the real template's 15 columns. `null` would write no cell
  // at all and the sheet would come out six columns wide.
  const padding: AsanCell[] = Array.from(
    { length: BANK_DEPOSIT_HEADERS.length - named.length },
    () => "",
  );
  return [[...named, ...padding]];
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
