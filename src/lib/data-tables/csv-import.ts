import type { DynamicColumnDataType } from "./constants";

export const CSV_IMPORT_MAX_ROWS = 5000;
/** Atomic mode: send all valid rows in a single RPC call (server enforces 5000 cap). */

export interface CsvImportColumn {
  id: string;
  column_key: string;
  label: string;
  data_type: DynamicColumnDataType;
  is_required: boolean;
}

export type CsvDelimiter = "," | ";" | "\t";

export const CSV_DELIMITER_LABELS: Record<CsvDelimiter, string> = {
  ",": "ویرگول (,)",
  ";": "نقطه‌ویرگول (;)",
  "\t": "تب (Tab)",
};

export interface ParsedCsv {
  headers: string[];
  rows: string[][]; // raw text rows excluding header
  delimiter: CsvDelimiter;
  warnings: string[];
}

export interface RowError {
  rowIndex: number; // 1-based human row number (excluding header)
  columnLabel: string;
  value: string;
  message: string;
}

export interface ValidationResult {
  valid: Array<Record<string, string>>;
  errors: RowError[];
  totalRows: number;
  validCount: number;
  errorRowCount: number;
}

/**
 * Auto-detect CSV delimiter by scanning the first ~10 raw lines.
 * Picks the candidate with the most consistent column count across lines.
 */
export function detectDelimiter(text: string): CsvDelimiter | null {
  const sample = text.slice(0, 64 * 1024);
  const lines = sample.split(/\r?\n/).filter((l) => l.length > 0).slice(0, 10);
  if (lines.length === 0) return null;
  const candidates: CsvDelimiter[] = [",", ";", "\t"];
  let best: { d: CsvDelimiter; score: number } | null = null;
  for (const d of candidates) {
    // count delimiter occurrences outside quotes per line
    const counts = lines.map((line) => countOutsideQuotes(line, d));
    const max = Math.max(...counts);
    if (max === 0) continue;
    // consistency: how many lines share the max count
    const consistent = counts.filter((c) => c === max).length;
    const score = max * 10 + consistent; // prefer many fields + consistency
    if (!best || score > best.score) best = { d, score };
  }
  return best ? best.d : null;
}

function countOutsideQuotes(line: string, ch: string): number {
  let count = 0;
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { i++; continue; }
      inQ = !inQ;
      continue;
    }
    if (!inQ && c === ch) count++;
  }
  return count;
}

/**
 * Minimal RFC 4180-ish CSV parser (handles quoted fields, escaped quotes, CRLF).
 * Pure JS, no deps. Strips UTF-8 BOM. Trims trailing empty lines.
 * Supports comma, semicolon, or tab delimiters (auto-detected if not provided).
 */
export function parseCsv(text: string, delimiter?: CsvDelimiter): ParsedCsv {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const warnings: string[] = [];
  const detected = delimiter ?? detectDelimiter(text);
  if (!detected) {
    return { headers: [], rows: [], delimiter: ",", warnings: ["delimiter_unknown"] };
  }
  const delim = detected;

  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delim) { cur.push(field); field = ""; i++; continue; }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      cur.push(field); rows.push(cur); cur = []; field = ""; i++; continue;
    }
    if (ch === "\n") {
      cur.push(field); rows.push(cur); cur = []; field = ""; i++; continue;
    }
    field += ch; i++;
  }
  // flush last field/row
  if (field.length > 0 || cur.length > 0) {
    cur.push(field); rows.push(cur);
  }
  // drop trailing fully-empty rows
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) {
    rows.pop();
  }
  if (rows.length === 0) return { headers: [], rows: [], delimiter: delim, warnings };
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  // Structural sanity: rows whose column count differs significantly from header
  const expected = headers.length;
  let mismatched = 0;
  for (const r of dataRows) {
    if (Math.abs(r.length - expected) > 0) mismatched++;
  }
  if (mismatched > 0 && dataRows.length > 0) {
    const ratio = mismatched / dataRows.length;
    if (ratio > 0.1) {
      warnings.push(
        `column_count_mismatch:${mismatched}/${dataRows.length}`,
      );
    }
  }

  return { headers, rows: dataRows, delimiter: delim, warnings };
}

/** Convert Persian/Arabic digits to ASCII digits. */
function normalizeDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function isValidNumber(v: string): boolean {
  const n = Number(normalizeDigits(v).replace(/,/g, ""));
  return Number.isFinite(n);
}

function parseBoolean(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (["true", "1", "yes", "y", "بله"].includes(s)) return true;
  if (["false", "0", "no", "n", "خیر"].includes(s)) return false;
  return null;
}

function isValidDate(v: string): boolean {
  // Accept YYYY-MM-DD or anything Date can parse safely
  const s = normalizeDigits(v).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const d = new Date(s);
    return !Number.isNaN(d.getTime());
  }
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function isValidDateTime(v: string): boolean {
  const s = normalizeDigits(v).trim();
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

/**
 * Validate parsed rows against dynamic columns and a CSV→column mapping.
 * @param mapping  Record<column_key, csvHeader>. Unmapped columns are skipped.
 */
export function validateRows(
  parsed: ParsedCsv,
  columns: CsvImportColumn[],
  mapping: Record<string, string>,
): ValidationResult {
  const valid: Array<Record<string, string>> = [];
  const errors: RowError[] = [];
  const headerIndex = new Map<string, number>();
  parsed.headers.forEach((h, idx) => headerIndex.set(h, idx));

  parsed.rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 1;
    const out: Record<string, string> = {};
    let rowHasError = false;

    for (const col of columns) {
      const csvHeader = mapping[col.column_key];
      const rawIdx = csvHeader ? headerIndex.get(csvHeader) : undefined;
      const raw = rawIdx !== undefined ? (row[rawIdx] ?? "") : "";
      const trimmed = raw.trim();

      if (trimmed === "") {
        if (col.is_required) {
          errors.push({
            rowIndex: rowNum,
            columnLabel: col.label,
            value: "",
            message: "مقدار الزامی است.",
          });
          rowHasError = true;
        }
        continue;
      }

      let normalized = trimmed;
      let ok = true;
      let msg = "";

      switch (col.data_type) {
        case "number":
          if (!isValidNumber(trimmed)) { ok = false; msg = "عدد معتبر نیست."; }
          else normalized = normalizeDigits(trimmed).replace(/,/g, "");
          break;
        case "boolean": {
          const b = parseBoolean(trimmed);
          if (b === null) { ok = false; msg = "مقدار بولی نامعتبر است (true/false، بله/خیر، 1/0)."; }
          else normalized = b ? "true" : "false";
          break;
        }
        case "date":
          if (!isValidDate(trimmed)) { ok = false; msg = "تاریخ معتبر نیست (مثال: 2025-01-31)."; }
          else normalized = normalizeDigits(trimmed);
          break;
        case "datetime":
          if (!isValidDateTime(trimmed)) { ok = false; msg = "تاریخ و ساعت معتبر نیست."; }
          else normalized = normalizeDigits(trimmed);
          break;
        default:
          // text / phone / tag / status — keep as-is
          break;
      }

      if (!ok) {
        errors.push({ rowIndex: rowNum, columnLabel: col.label, value: trimmed, message: msg });
        rowHasError = true;
        continue;
      }
      out[col.column_key] = normalized;
    }

    if (!rowHasError) valid.push(out);
  });

  return {
    valid,
    errors,
    totalRows: parsed.rows.length,
    validCount: valid.length,
    errorRowCount: parsed.rows.length - valid.length,
  };
}

/** Auto-suggest mapping by exact match of column_key or label against CSV headers. */
export function suggestMapping(
  columns: CsvImportColumn[],
  headers: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const norm = (s: string) => s.trim().toLowerCase();
  const headerSet = new Map(headers.map((h) => [norm(h), h]));
  for (const col of columns) {
    const byKey = headerSet.get(norm(col.column_key));
    if (byKey) { out[col.column_key] = byKey; continue; }
    const byLabel = headerSet.get(norm(col.label));
    if (byLabel) { out[col.column_key] = byLabel; continue; }
  }
  return out;
}