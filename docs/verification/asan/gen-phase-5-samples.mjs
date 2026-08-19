/**
 * Phase 5 samples — driven by the live `asan_list_journal_export` RPC.
 *
 * One document per file (Asan Layout 3 merges a sheet under one شماره سند).
 * Only unblocked rows. Reversals and cheques are already absent from the RPC (367).
 * Amounts: AfraKala Toman × 10 = Rial.
 *
 * Do not import these workbooks into Asan unless a file contains exactly one document.
 * Prefer a download from /admin/asan-export.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const dir = path.dirname(fileURLToPath(import.meta.url));
const headers = ["کد حساب", "کد کالا", "شرح", "تعداد", "بدهکار", "بستانکار"];
const ADMIN = "1a15e8c6-3a83-49c2-9531-db9046d30968";
const FROM = "2026-07-01";
const TO = "2026-08-31";

function toRial(s) {
  if (s == null || s === "" || s === "0") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return null;
  return n * 10;
}

function parseCsvLine(line) {
  const parts = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === "," && !inQ) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts;
}

const sql = `SET client_encoding = 'UTF8';
BEGIN;
SELECT set_config('request.jwt.claims',
  '{"sub":"${ADMIN}","role":"authenticated"}', true);
\\copy (SELECT doc_id, doc_kind, line_no, coalesce(account_code,''), coalesce(line_description,''), debit, credit, coalesce(blocked_reason,'') FROM public.asan_list_journal_export('${FROM}'::date,'${TO}'::date,'all') ORDER BY doc_date, doc_id, line_no) TO '/tmp/p5r-gen.csv' CSV
ROLLBACK;
`;

const tmpSql = path.join(os.tmpdir(), "p5r-gen.sql");
const tmpCsv = path.join(os.tmpdir(), "p5r-gen.csv");
fs.writeFileSync(tmpSql, sql, "utf8");

const cp = spawnSync("docker", ["cp", tmpSql, "afrakala-lan-db:/tmp/p5r-gen.sql"], { encoding: "utf8" });
if (cp.status !== 0) throw new Error(cp.stderr || "docker cp sql failed");
const pw = spawnSync("docker", ["exec", "afrakala-lan-db", "printenv", "POSTGRES_PASSWORD"], {
  encoding: "utf8",
}).stdout.trim();
const run = spawnSync(
  "docker",
  [
    "exec",
    "-e",
    `PGPASSWORD=${pw}`,
    "afrakala-lan-db",
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    "afrakala",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "/tmp/p5r-gen.sql",
  ],
  { encoding: "utf8" },
);
if (run.status !== 0) throw new Error(run.stderr || run.stdout || "psql failed");
const out = spawnSync("docker", ["cp", "afrakala-lan-db:/tmp/p5r-gen.csv", tmpCsv], { encoding: "utf8" });
if (out.status !== 0) throw new Error(out.stderr || "docker cp csv failed");

const csv = fs.existsSync(tmpCsv) ? fs.readFileSync(tmpCsv, "utf8").trim() : "";
const rows = [];
if (csv) {
  for (const line of csv.split(/\r?\n/)) {
    const parts = parseCsvLine(line);
    if (parts.length < 8) {
      console.warn("csv fields", parts.length);
      continue;
    }
    rows.push({
      docId: parts[0],
      kind: parts[1],
      lineNo: parts[2],
      code: parts[3],
      desc: parts[4],
      debit: parts[5],
      credit: parts[6],
      blocked: parts[7],
    });
  }
}

const byDoc = new Map();
for (const r of rows) {
  if (r.blocked) continue;
  if (!r.lineNo) continue;
  const list = byDoc.get(r.docId) ?? [];
  list.push(r);
  byDoc.set(r.docId, list);
}

let nFiles = 0;
for (const [docId, list] of byDoc) {
  const kind = list[0].kind || "doc";
  const aoa = [
    headers,
    ...list.map((r) => [r.code, "", r.desc, null, toRial(r.debit), toRial(r.credit)]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map((h) => ({ wch: Math.min(40, Math.max(12, h.length + 8)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const fileName = `phase-5-asan-${kind}-${docId.slice(0, 8)}.xlsx`;
  XLSX.writeFile(wb, path.join(dir, fileName));
  nFiles += 1;
  console.log(fileName, "lines", list.length);
}

console.log(
  "exportable_documents",
  nFiles,
  "rpc_rows",
  rows.length,
  "blocked_or_empty_skipped",
  rows.filter((r) => r.blocked || !r.lineNo).length,
);
if (nFiles === 0) {
  console.log(
    "honest: this database has no unblocked journal document in the sample range after 367 (seed is blocked; OG14-CONC pair excluded). payment/dual branches are unproven here.",
  );
}
