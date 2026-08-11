/**
 * ASAN M3.4 — parse an Asan product export (`کالا.xlsx`, 7 256 rows).
 *
 * Parsed **by header text, never by column index**, through the shared
 * `parse-workbook.ts` helpers. Two things about this particular workbook make that
 * more than a principle:
 *
 *   * three columns share the header `مقدار/واحد`, so "first occurrence wins" is a
 *     rule with a real file behind it;
 *   * `بارکدکـالا` and `سریال کـالا` contain a **tatweel** (U+0640) inside the word.
 *     The constants below are written the ordinary way and the normalizer strips
 *     tatweel, so both spellings resolve to the same column.
 *
 * Barcode and serial are captured even though R1.5 measured `بارکدکـالا` as **0 %
 * populated across all 7 256 rows**. Recording an empty column is honest; leaving it
 * out would make a later "we never had barcodes" question unanswerable from the
 * staged data.
 */

import { buildHeaderIndex, cell, isBlankRow } from "./parse-workbook";

/** Canonical Asan headers for the product export, as measured against the real file. */
export const ASAN_PRODUCT_HEADERS = {
  asan_code: "کد کالا",
  name: "شرح کالا",
  barcode: "بارکدکالا",
  serial: "سریال کالا",
  unit: "واحد 1",
} as const;

export type AsanProductField = keyof typeof ASAN_PRODUCT_HEADERS;

export type ParsedProductRow = {
  /** 1-based spreadsheet row, header occupies row 1 — so data starts at 2. */
  row_number: number;
  asan_code: string | null;
  name: string | null;
  barcode_raw: string | null;
  serial_raw: string | null;
  unit_raw: string | null;
};

export type ProductParseResult = {
  rows: ParsedProductRow[];
  mapping: Record<AsanProductField, string | null>;
  ignoredHeaders: string[];
  warnings: string[];
};

/**
 * @param matrix rows of raw cell values; `matrix[0]` must be the header row.
 */
export function parseAsanProducts(matrix: unknown[][]): ProductParseResult {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return {
      rows: [],
      mapping: { asan_code: null, name: null, barcode: null, serial: null, unit: null },
      ignoredHeaders: [],
      warnings: ["فایل خالی است"],
    };
  }

  const header = matrix[0] ?? [];
  const { mapping, index, ignoredHeaders, warnings } = buildHeaderIndex(
    header,
    ASAN_PRODUCT_HEADERS,
  );

  if (index.asan_code === null) {
    warnings.push("بدون ستون «کد کالا» امکان تطبیق مطمئن وجود ندارد");
  }
  if (index.name === null) {
    warnings.push("بدون ستون «شرح کالا» هیچ تطبیقی ممکن نیست");
  }

  const at = (row: unknown[], field: AsanProductField): string | null => {
    const i = index[field];
    return i === null ? null : cell(row[i]);
  };

  const rows: ParsedProductRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    if (isBlankRow(row)) continue;
    rows.push({
      row_number: r + 1,
      asan_code: at(row, "asan_code"),
      // Scrambled text is preserved verbatim, per the brief — a human corrects it later.
      name: at(row, "name"),
      barcode_raw: at(row, "barcode"),
      serial_raw: at(row, "serial"),
      unit_raw: at(row, "unit"),
    });
  }

  const uncoded = rows.filter((r) => !r.asan_code).length;
  if (uncoded > 0) warnings.push(`${uncoded} ردیف بدون «کد کالا» است`);
  const unnamed = rows.filter((r) => !r.name).length;
  if (unnamed > 0) warnings.push(`${unnamed} ردیف بدون «شرح کالا» است`);

  const withBarcode = rows.filter((r) => r.barcode_raw).length;
  if (withBarcode === 0 && rows.length > 0) {
    // R1.5 measured this as 0/7 256. Saying so out loud stops a future reader from
    // reading "0 barcode matches" as a failed strategy rather than an absent column.
    warnings.push("ستون بارکد در این فایل کاملاً خالی است؛ تطبیق بر اساس بارکد ممکن نیست");
  }

  return { rows, mapping, ignoredHeaders, warnings };
}
