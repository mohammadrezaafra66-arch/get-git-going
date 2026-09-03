/**
 * ASAN M4.2 — writing the sheet.
 *
 * `aoa_to_sheet` rather than `json_to_sheet`, deliberately: the sales layout has a **blank
 * header in column K** and several layouts repeat header text across files. A JSON row keyed by
 * header text cannot express an unnamed column, and would silently collapse it — shifting
 * L..R one column left and posting discounts into the wrong field. An array of arrays keeps
 * position, which is what Asan actually reads.
 *
 * Amounts are written as real numbers, never strings: a string with a thousands separator is
 * not summable, and a Persian-digit string is not even a number to Excel.
 *
 * **`bookSST: true` is load-bearing — do not drop it.** Without it SheetJS writes every string
 * cell as `<c t="str"><v>…</v></c>`, which is the CACHED FORMULA RESULT type: it carries no `<f>`
 * element, so the cell is malformed, and no `xl/sharedStrings.xml` is emitted at all. Excel and
 * LibreOffice tolerate that; **Asan does not** — it drops every text cell on import and keeps only
 * the numbers, which is exactly the symptom the owner reported ("only the number columns
 * survive"). `docs/asan/templates/FAILED-platform-export-sample.xlsx` is a file produced without
 * this flag, and both real Asan templates use `t="s"` against a shared-string table.
 * Measured on xlsx@0.18.5: default and `bookSST:false` -> 29 x `t="str"`, no SST;
 * `bookSST:true` -> 29 x `t="s"` plus a real SST. Numeric cells are unaffected either way.
 *
 * `xlsx` is loaded with a dynamic import, matching the rest of the project, so it stays out of
 * the main bundle.
 */
import type { AsanCell } from "@/lib/asan/export-types";

export interface AsanSheet {
  headers: readonly string[];
  rows: AsanCell[][];
  /** Sheet name inside the workbook. */
  sheetName?: string;
}

/** Build the workbook bytes. Separated from downloading so tests can inspect them. */
export async function buildAsanWorkbook(sheet: AsanSheet): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
  const aoa: (string | number | null)[][] = [[...sheet.headers], ...sheet.rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = sheet.headers.map((h) => ({ wch: Math.min(30, Math.max(10, h.length + 6)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName ?? "Sheet1");
  return XLSX.write(wb, { bookType: "xlsx", type: "array", bookSST: true }) as ArrayBuffer;
}

/** Build and hand the file to the browser. Nothing is stored on the server. */
export async function downloadAsanWorkbook(sheet: AsanSheet, fileName: string): Promise<number> {
  const bytes = await buildAsanWorkbook(sheet);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return sheet.rows.length;
}
