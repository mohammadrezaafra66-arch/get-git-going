import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const dir = path.dirname(fileURLToPath(import.meta.url));
const headers = ["کد حساب", "کد کالا", "شرح", "تعداد", "بدهکار", "بستانکار"];

function toRial(s) {
  if (s == null || s === "" || s === "0") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return null;
  return n * 10;
}

function writeSample(fileName, rows) {
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map((h) => ({ wch: Math.min(40, Math.max(12, h.length + 8)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = path.join(dir, fileName);
  XLSX.writeFile(wb, out);
  console.log(fileName, "rows", rows.length);
}

const csv = fs.readFileSync(path.join(dir, "phase-5-receipt-lines.csv"), "utf8").trim();
const receiptRows = csv
  ? csv.split(/\r?\n/).map((line) => {
      const m = line.match(/^([^,]*),([^,]*),(.*),([^,]*),([^,]*),([^,]*)$/);
      if (!m) throw new Error("csv parse: " + line);
      const code = m[1];
      const product = m[2].replace(/^""$/, "");
      const desc = m[3].replace(/^"(.*)"$/, "$1");
      return [code, product, desc, null, toRial(m[5]), toRial(m[6])];
    })
  : [];

writeSample("phase-5-asan-receipts.xlsx", receiptRows);
writeSample("phase-5-asan-payments.xlsx", []);
writeSample("phase-5-asan-third-party.xlsx", []);
