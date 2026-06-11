/**
 * CSV export helpers for dynamic data tables (Phase 4.5).
 * - UTF-8 BOM so Excel opens Persian text correctly.
 * - Comma delimiter, RFC4180-style quoting (double quotes, doubled inside).
 */

import type { DynamicColumnDataType } from "./constants";

export type ExportColumnDef = {
  column_key: string;
  label: string;
  data_type: DynamicColumnDataType;
  sort_order: number;
};

export type ExportRow = {
  row_number: number;
  is_active: boolean;
  values: Record<string, unknown>;
};

function csvEscape(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let s = typeof raw === "string" ? raw : String(raw);
  // Strip BOM if any value already contains it
  s = s.replace(/^\uFEFF/, "");
  const needsQuote = /[",\n\r;\t]/.test(s);
  if (needsQuote) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatCellForCsv(col: ExportColumnDef, raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  switch (col.data_type) {
    case "boolean":
      if (raw === true) return "true";
      if (raw === false) return "false";
      return "";
    case "number":
      return typeof raw === "number" ? String(raw) : String(raw ?? "");
    case "date":
      // value comes as YYYY-MM-DD string from JSON
      return String(raw);
    case "datetime":
      return String(raw);
    default:
      return String(raw);
  }
}

/** Build a CSV string with UTF-8 BOM, header = row_number + ordered columns. */
export function buildCsv(columns: ExportColumnDef[], rows: ExportRow[]): string {
  const ordered = [...columns].sort((a, b) => a.sort_order - b.sort_order);
  const header = ["row_number", "is_active", ...ordered.map((c) => c.label)];
  const lines: string[] = [];
  lines.push(header.map(csvEscape).join(","));
  for (const r of rows) {
    const row: string[] = [
      String(r.row_number),
      r.is_active ? "true" : "false",
      ...ordered.map((c) => csvEscape(formatCellForCsv(c, r.values?.[c.column_key]))),
    ];
    lines.push(row.join(","));
  }
  // UTF-8 BOM for Excel
  return "\uFEFF" + lines.join("\r\n");
}

/** Trigger a browser download of the given CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke a bit so Safari finishes the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildExportFilename(slug: string | null | undefined): string {
  const safe = (slug ?? "table").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60) || "table";
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${safe}_${ts}.csv`;
}
