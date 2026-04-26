import type { DynamicColumnDataType } from "./constants";

export const CSV_IMPORT_MAX_ROWS = 5000;
export const CSV_IMPORT_BATCH_SIZE = 400;

export interface CsvImportColumn {
  id: string;
  column_key: string;
  label: string;
  data_type: DynamicColumnDataType;
  is_required: boolean;
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][]; // raw text rows excluding header
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
 * Minimal RFC 4180-ish CSV parser (handles quoted fields, escaped quotes, CRLF).
 * Pure JS, no deps. Strips UTF-8 BOM. Trims trailing empty line.
 */
export function parseCsv(text: string): ParsedCsv {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
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
    if (ch === ",") { cur.push(field); field = ""; i++; continue; }
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
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows };
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