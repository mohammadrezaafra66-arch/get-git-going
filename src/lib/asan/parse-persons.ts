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
 */

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

/** Collapse whitespace and fold the Arabic/Persian letter variants a header may use. */
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/ي/g, "ی") // ARABIC YEH -> FARSI YEH
    .replace(/ك/g, "ک") // ARABIC KAF -> KEHEH
    .replace(/‌/g, "") // ZWNJ
    .replace(/[\s‎‏]+/g, "")
    .trim();
}

function cell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

/**
 * @param matrix rows of raw cell values; `matrix[0]` must be the header row.
 */
export function parseAsanPersons(matrix: unknown[][]): ParseResult {
  const warnings: string[] = [];
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
  const byNormalized = new Map<string, number>();
  header.forEach((h, i) => {
    const key = normalizeHeader(h);
    // First occurrence wins: `کالا.xlsx` really does repeat a header (three `مقدار/واحد`
    // columns), so a later duplicate must not silently steal the mapping.
    if (key && !byNormalized.has(key)) byNormalized.set(key, i);
  });

  const mapping = {} as Record<AsanPersonField, string | null>;
  const index = {} as Record<AsanPersonField, number | null>;
  for (const [field, headerText] of Object.entries(ASAN_PERSON_HEADERS) as [
    AsanPersonField,
    string,
  ][]) {
    const i = byNormalized.get(normalizeHeader(headerText));
    index[field] = i ?? null;
    mapping[field] = i === undefined ? null : String(header[i] ?? headerText);
    if (i === undefined) warnings.push(`ستون «${headerText}» در فایل پیدا نشد`);
  }

  if (index.asan_code === null) {
    warnings.push("بدون ستون «کد حساب» امکان تطبیق مطمئن وجود ندارد");
  }

  const used = new Set(Object.values(index).filter((i): i is number => i !== null));
  const ignoredHeaders = header
    .map((h, i) => (used.has(i) ? null : String(h ?? "").trim()))
    .filter((h): h is string => !!h && h.length > 0);

  const at = (row: unknown[], field: AsanPersonField): string | null => {
    const i = index[field];
    return i === null ? null : cell(row[i]);
  };

  const rows: ParsedPersonRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    if (row.every((v) => v === null || v === undefined || String(v).trim() === "")) continue;
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
