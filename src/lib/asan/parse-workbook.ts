/**
 * ASAN — the shared, header-driven part of reading an Asan export.
 *
 * Extracted in M3.4 from `parse-persons.ts` (M3.3), which already said in its own
 * header that it would be "reused by the products importer in 3.4". Both workbooks
 * are RTL exports from the same program with the same habits — repeated headers,
 * Arabic letter variants, tatweel padding — so the mapping rules belong in one
 * place rather than in two files that will drift.
 *
 * Everything here is pure and client-safe: no Supabase, no filesystem.
 */

/**
 * Collapse whitespace and fold the letter variants an Asan header may use.
 *
 * Tatweel (U+0640) matters and is not cosmetic pedantry: the product workbook
 * really does ship `بارکدکـالا` and `سریال کـالا` with a tatweel inside the word,
 * so a constant written the ordinary way would never match its own column. It is a
 * purely presentational elongation character, so stripping it can only ever help.
 */
export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/ي/g, "ی") // ARABIC YEH -> FARSI YEH
    .replace(/ك/g, "ک") // ARABIC KAF -> KEHEH
    .replace(/ـ/g, "") // TATWEEL
    .replace(/‌/g, "") // ZWNJ
    .replace(/[\s‎‏]+/g, "")
    .trim();
}

/** A cell as trimmed text, with empty treated as absent. */
export function cell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

export type HeaderMap<F extends string> = {
  /** field -> the header text actually found, or null when the column is absent. */
  mapping: Record<F, string | null>;
  /** field -> its column index, or null when the column is absent. */
  index: Record<F, number | null>;
  /** Headers present in the file that we do not use. Informational only. */
  ignoredHeaders: string[];
  warnings: string[];
};

/**
 * Resolve each wanted field to a column **by header text, never by index**.
 *
 * @param header    the workbook's first row
 * @param headers   field -> canonical Asan header text
 */
export function buildHeaderIndex<F extends string>(
  header: unknown[],
  headers: Record<F, string>,
): HeaderMap<F> {
  const warnings: string[] = [];
  const byNormalized = new Map<string, number>();
  header.forEach((h, i) => {
    const key = normalizeHeader(h);
    // First occurrence wins: `کالا.xlsx` really does repeat a header (three
    // `مقدار/واحد` columns), so a later duplicate must not silently steal the mapping.
    if (key && !byNormalized.has(key)) byNormalized.set(key, i);
  });

  const mapping = {} as Record<F, string | null>;
  const index = {} as Record<F, number | null>;
  for (const [field, headerText] of Object.entries(headers) as [F, string][]) {
    const i = byNormalized.get(normalizeHeader(headerText));
    index[field] = i ?? null;
    mapping[field] = i === undefined ? null : String(header[i] ?? headerText);
    if (i === undefined) warnings.push(`ستون «${headerText}» در فایل پیدا نشد`);
  }

  const used = new Set(Object.values(index).filter((i): i is number => i !== null));
  const ignoredHeaders = header
    .map((h, i) => (used.has(i) ? null : String(h ?? "").trim()))
    .filter((h): h is string => !!h && h.length > 0);

  return { mapping, index, ignoredHeaders, warnings };
}

/** True when every cell of the row is empty — such rows are skipped, not imported. */
export function isBlankRow(row: unknown[]): boolean {
  return row.every((v) => v === null || v === undefined || String(v).trim() === "");
}
