/**
 * ASAN M4.2 — the one interface every Asan export implements.
 *
 * Five exports were specified (sales, purchase, receipts, payments, third-party) plus a
 * secondary bank-deposit path. Three of them share a single layout and a single row builder;
 * writing three mappers for the same six columns is exactly the parallel-implementation trap
 * this project keeps falling into. So the shell knows nothing about any particular export —
 * it takes a definition, lists what the definition found, and writes what the definition
 * builds.
 *
 * A definition that is not built yet says so (`available: false`) and **refuses to produce a
 * file** rather than emitting a guess. That is the same stance `src/lib/export/export-modes.ts`
 * already took for the unconfigured Asan adapters, kept deliberately.
 */
import type { AsanLayoutKey } from "@/lib/asan/layouts";

/** A cell as it is written to the sheet: text, a real number, or an empty cell. */
export type AsanCell = string | number | null;

/** The numbering registers from migration 290. Each mirrors a separate Asan register. */
export type AsanDocType = "sales_invoice" | "purchase_invoice" | "accounting_document";

export type AsanExportKey =
  | "sales"
  | "purchase"
  | "receipts"
  | "payments"
  | "third_party"
  | "purchase_settlement"
  | "bank_deposits";

/** One exportable source document, as shown in the preview. */
export interface AsanExportDocument {
  /** The internal id the Asan number is bound to. */
  sourceId: string;
  /** Human label — invoice/quote number or document description. */
  title: string;
  /** Tehran calendar date, ISO `YYYY-MM-DD`. */
  dateIso: string;
  /** Counterparty name, for the accountant to recognise the row. */
  partyName: string;
  /** Document total in **Toman** (AfraKala's unit). Displayed; converted at build time. */
  totalToman: number | null;
  /** How many sheet rows this document will produce. */
  rowCount: number;
  /** Already-assigned Asan number, or null if this document has never been exported. */
  asanNumber: number | null;
  /**
   * Non-null means this document cannot be exported. It is shown in the preview with this
   * Persian reason and excluded from the file — never silently dropped, never a failed export.
   */
  blockedReason: string | null;
  /**
   * مهاجرت ۳۲۰ — true یعنی شرح این سند از سند مبدأ ساخته نشد و همان متن
   * ذخیره‌شده است (معمولاً سندهایی که پیش از این قابلیت ثبت شده‌اند). سند کاملاً
   * قابل خروجی است؛ فقط شرحش کم‌جزئیات‌تر است، و رابط این را نشان می‌دهد تا
   * حسابدار تفاوت دو ردیف را ببیند و دنبال باگ نگردد.
   */
  hasSimpleDescription?: boolean;
  /** Whatever the definition needs at build time. Opaque to the shell. */
  payload: unknown;
}

export interface AsanExportRange {
  /** Inclusive Tehran calendar dates, ISO `YYYY-MM-DD`. */
  fromIso: string;
  toIso: string;
}

export interface AsanExportDefinition {
  key: AsanExportKey;
  /** Persian label shown in the export-type selector. */
  label: string;
  /** Which Asan screen this file targets, spelled out for the accountant. */
  targetScreen: string;
  layout: AsanLayoutKey;
  /** Numbering register, or null for a layout that carries no document number. */
  docType: AsanDocType | null;
  /** False while the export is specified but not yet built. */
  available: boolean;
  /** Anything the owner still has to confirm, shown as a warning before download. */
  unverifiedNote?: string;
  list(range: AsanExportRange): Promise<AsanExportDocument[]>;
  /**
   * Build the sheet rows for one document. `asanNumber` is the number just assigned (or
   * re-assigned — assignment is idempotent), so column A is stable across re-exports.
   */
  buildRows(doc: AsanExportDocument, asanNumber: number | null): AsanCell[][];
}

/** Thrown instead of writing a file for an export that has not been built yet. */
export class AsanExportNotAvailableError extends Error {
  constructor(label: string) {
    super(
      `خروجی «${label}» هنوز ساخته نشده است و عمداً فایلی تولید نمی‌کند. ` +
        `تا زمانی که ستون‌های آن مطابق مستند تأییدشده پیاده نشود، فایل نیمه‌درست ساخته نمی‌شود.`,
    );
    this.name = "AsanExportNotAvailableError";
  }
}

/** A definition placeholder for an export whose phase has not run yet. */
export function notBuiltYet(
  key: AsanExportKey,
  label: string,
  targetScreen: string,
  layout: AsanLayoutKey,
  docType: AsanDocType | null,
): AsanExportDefinition {
  return {
    key,
    label,
    targetScreen,
    layout,
    docType,
    available: false,
    async list() {
      return [];
    },
    buildRows() {
      throw new AsanExportNotAvailableError(label);
    },
  };
}
