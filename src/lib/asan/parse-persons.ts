/**
 * ASAN M3.3 — parse an Asan person export (`اشخاص.xlsx`).
 *
 * Parsed **by header text, never by column index**. The workbooks are RTL and the brief is
 * explicit that column order is not guaranteed stable; research R2 confirmed the header names
 * but not that their positions are fixed. Reading `کد حساب` by name costs nothing and removes
 * a whole class of silent, catastrophic misalignment.
 *
 * Pure and client-safe: no Supabase, no filesystem. It takes an already-read worksheet matrix
 * so it can be unit-tested and reused by the products importer in 3.4.
 *
 * M3.4 moved the header-mapping machinery to `parse-workbook.ts` so the products parser
 * shares it rather than copying it. Behaviour here is unchanged — the two parser cases in
 * `e2e/asan/import-persons.spec.ts` (488 rows, and an identical parse from a reversed
 * column order) are what proves that.
 */

import { buildHeaderIndex, cell, isBlankRow } from "./parse-workbook";

/** Canonical Asan headers for the person export, as measured in R2. */
export const ASAN_PERSON_HEADERS = {
  asan_code: "کد حساب",
  display_name: "نام حساب",
  mobile: "موبایل",
  landline: "تلفن",
  national_id: "کد ملی",
  address: "آدرس",
} as const;

export type AsanPersonField = keyof typeof ASAN_PERSON_HEADERS;

export type ParsedPersonRow = {
  /** 1-based spreadsheet row, header occupies row 1 — so data starts at 2. */
  row_number: number;
  asan_code: string | null;
  display_name: string | null;
  mobile_raw: string | null;
  landline_raw: string | null;
  national_id_raw: string | null;
  address: string | null;
};

export type ParseResult = {
  rows: ParsedPersonRow[];
  /** field -> the header text actually found, or null when the column is absent. */
  mapping: Record<AsanPersonField, string | null>;
  /** Headers present in the file that we do not use. Informational only. */
  ignoredHeaders: string[];
  /** Problems that do not stop the parse. */
  warnings: string[];
};

/**
 * @param matrix rows of raw cell values; `matrix[0]` must be the header row.
 */
export function parseAsanPersons(matrix: unknown[][]): ParseResult {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return {
      rows: [],
      mapping: {
        asan_code: null,
        display_name: null,
        mobile: null,
        landline: null,
        national_id: null,
        address: null,
      },
      ignoredHeaders: [],
      warnings: ["فایل خالی است"],
    };
  }

  const header = matrix[0] ?? [];
  const { mapping, index, ignoredHeaders, warnings } = buildHeaderIndex(
    header,
    ASAN_PERSON_HEADERS,
  );

  if (index.asan_code === null) {
    warnings.push("بدون ستون «کد حساب» امکان تطبیق مطمئن وجود ندارد");
  }

  const at = (row: unknown[], field: AsanPersonField): string | null => {
    const i = index[field];
    return i === null ? null : cell(row[i]);
  };

  const rows: ParsedPersonRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    if (isBlankRow(row)) continue;
    rows.push({
      row_number: r + 1,
      asan_code: at(row, "asan_code"),
      display_name: at(row, "display_name"),
      mobile_raw: at(row, "mobile"),
      landline_raw: at(row, "landline"),
      national_id_raw: at(row, "national_id"),
      // Scrambled text is preserved verbatim, per the brief — a human corrects it later.
      address: at(row, "address"),
    });
  }

  const unnamed = rows.filter((r) => !r.display_name).length;
  if (unnamed > 0) warnings.push(`${unnamed} ردیف بدون «نام حساب» است`);

  return { rows, mapping, ignoredHeaders, warnings };
}
