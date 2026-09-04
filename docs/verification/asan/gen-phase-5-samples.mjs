/**
 * Phase 5 samples — driven by the live `asan_list_journal_export` RPC.
 *
 * **The canonical way to produce an Asan file is `/admin/asan-export`.** This script exists only
 * to put sample workbooks on disk from a shell, and it is deliberately NOT a second
 * implementation of the export:
 *
 *   * the six column headers are read out of `src/lib/asan/layouts.ts` at run time, not retyped
 *     — a `.mjs` cannot import a `.ts`, so they are extracted from the source and the extraction
 *     **throws** rather than falling back to a copy;
 *   * the Toman→Rial factor is read out of `src/lib/asan/amounts.ts` the same way;
 *   * `bookSST: true` is passed to the writer for the same reason `write-xlsx.ts` passes it —
 *     without it every string cell is written `t="str"` with no `xl/sharedStrings.xml`, and Asan
 *     drops every Persian word on import while keeping the numbers.
 *
 * **A file may hold more than one document (2026-09-04).** The header used to say the opposite.
 * Asan assigns `شماره سند` itself at posting time and layout 3 has no column for it, so nothing
 * in a multi-document sheet can collide; the app's own one-document refusal was removed in the
 * same change. This script therefore writes one workbook per document **and** one combined
 * workbook holding all of them.
 *
 * Only unblocked rows are written. Reversals and cheques are already absent from the RPC (367).
 *
 * SQL reaches the container over **stdin as a Buffer**, never `docker cp` — `docker cp` is broken
 * on this host at the Docker Desktop mount layer (CLAUDE.md, "Safety rules for database work").
 * The statement runs inside `BEGIN … ROLLBACK` and writes nothing.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "../../..");
const ADMIN = "1a15e8c6-3a83-49c2-9531-db9046d30968";
const FROM = "2026-07-01";
const TO = "2026-08-31";
const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const DB_NAME = process.env.E2E_DB_NAME ?? "afrakala";

/** The shipped journal headers, extracted from the layout module — never retyped here. */
function journalHeaders() {
  const src = fs.readFileSync(path.join(repo, "src/lib/asan/layouts.ts"), "utf8");
  const m = /export const JOURNAL_HEADERS[^=]*=\s*\[([\s\S]*?)\]\s*as const;/.exec(src);
  if (!m) throw new Error("JOURNAL_HEADERS not found in src/lib/asan/layouts.ts — do not guess it");
  const headers = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  if (headers.length !== 6) {
    throw new Error(`expected 6 journal headers, extracted ${headers.length}: ${headers.join("|")}`);
  }
  return headers;
}

/** The shipped Toman→Rial factor, extracted from the amounts module — never retyped here. */
function rialPerToman() {
  const src = fs.readFileSync(path.join(repo, "src/lib/asan/amounts.ts"), "utf8");
  const m = /export const RIAL_PER_TOMAN\s*=\s*(\d+);/.exec(src);
  if (!m) throw new Error("RIAL_PER_TOMAN not found in src/lib/asan/amounts.ts — do not guess it");
  return Number(m[1]);
}

const headers = journalHeaders();
const RIAL_PER_TOMAN = rialPerToman();

/** Mirrors `amountCell` in export-journal-rows.ts: a zero side is an EMPTY cell, not 0. */
function toRial(s) {
  if (s === null || s === undefined || s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return null;
  if (!Number.isInteger(n)) throw new Error(`fractional Toman amount refused: ${s}`);
  return n * RIAL_PER_TOMAN;
}

const sql = `SET client_encoding = 'UTF8';
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"${ADMIN}","role":"authenticated"}', true);
SELECT coalesce(json_agg(t)::text, '[]') FROM (
  SELECT doc_id::text AS doc_id,
         coalesce(doc_kind, '') AS doc_kind,
         line_no,
         coalesce(account_code, '') AS account_code,
         coalesce(line_description, '') AS line_description,
         debit, credit,
         coalesce(blocked_reason, '') AS blocked_reason
    FROM public.asan_list_journal_export('${FROM}'::date, '${TO}'::date, 'all')
   ORDER BY doc_date, doc_id, line_no
) t;
ROLLBACK;
`;

const pw = execFileSync("docker", ["exec", CONTAINER, "printenv", "POSTGRES_PASSWORD"], {
  encoding: "utf8",
}).trim();

// Buffer in, byte-exact: no shell and no encoding layer ever sees the Persian bytes.
const stdout = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "-e",
    `PGPASSWORD=${pw}`,
    CONTAINER,
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    DB_NAME,
    "-tAXq",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "-",
  ],
  { input: Buffer.from(sql, "utf8"), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

// `json_agg` pretty-prints one array element per line, so the value spans several output lines:
// take everything from the line that opens the array to the end.
const lines = stdout.split(/\r?\n/);
const start = lines.findIndex((l) => l.trimStart().startsWith("["));
if (start === -1) throw new Error(`no JSON row in psql output:\n${stdout}`);
const rows = JSON.parse(lines.slice(start).join("").trim());

const byDoc = new Map();
for (const r of rows) {
  if (r.blocked_reason) continue;
  if (r.line_no === null) continue;
  const list = byDoc.get(r.doc_id) ?? [];
  list.push(r);
  byDoc.set(r.doc_id, list);
}

const sheetRows = (list) =>
  list.map((r) => [r.account_code, "", r.line_description, null, toRial(r.debit), toRial(r.credit)]);

function write(fileName, aoaRows) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...aoaRows]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.min(40, Math.max(12, h.length + 8)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  // `bookSST` is load-bearing — see the header, and `write-xlsx.ts`.
  XLSX.writeFile(wb, path.join(dir, fileName), { bookSST: true });
}

let nFiles = 0;
const combined = [];
for (const [docId, list] of byDoc) {
  const kind = list[0].doc_kind || "doc";
  const aoaRows = sheetRows(list);
  combined.push(...aoaRows);
  write(`phase-5-asan-${kind}-${docId.slice(0, 8)}.xlsx`, aoaRows);
  nFiles += 1;
  console.log(`phase-5-asan-${kind}-${docId.slice(0, 8)}.xlsx`, "lines", list.length);
}

if (byDoc.size > 1) {
  write("phase-5-asan-all-documents.xlsx", combined);
  console.log("phase-5-asan-all-documents.xlsx", "documents", byDoc.size, "lines", combined.length);
}

console.log(
  "exportable_documents",
  nFiles,
  "rpc_rows",
  rows.length,
  "blocked_or_empty_skipped",
  rows.filter((r) => r.blocked_reason || r.line_no === null).length,
);
if (nFiles === 0) {
  console.log(
    "honest: this database has no unblocked journal document in the sample range after 367 (seed is blocked; OG14-CONC pair excluded). payment/dual branches are unproven here.",
  );
}
