#!/usr/bin/env node
// AfraKala — مقایسه storage بین source / export / target
// هیچ فایلی را تغییر نمی‌دهد.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.ENV_FILE || resolve(__dirname, "../.env");
function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv(ENV_FILE);

const BUCKET = process.env.STORAGE_BUCKET_PAYMENT_RECEIPTS || "payment-receipt-documents";
const SRC_DIR = resolve(__dirname, "..", process.env.STORAGE_EXPORT_DIR || "./storage-export");
const exportManifest = join(SRC_DIR, "storage-manifest.json");
const targetManifest = join(SRC_DIR, "storage-manifest.target.json");

function load(p) {
  if (!existsSync(p)) {
    console.error(`[MISSING] ${p}`);
    return null;
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

const a = load(exportManifest);
const b = load(targetManifest);
if (!a || !b) {
  console.error("هر دو manifest لازم است (export و target).");
  process.exit(1);
}

const idx = new Map(b.items.map((i) => [i.path, i]));
let same = 0,
  mismatch = 0,
  missing = 0;
const issues = [];
for (const it of a.items) {
  const t = idx.get(it.path);
  if (!t) {
    missing++;
    issues.push(`MISSING: ${it.path}`);
    continue;
  }
  if (t.sha256 !== it.sha256 || t.size !== it.size) {
    mismatch++;
    issues.push(`DIFF   : ${it.path} (size ${it.size}→${t.size})`);
  } else same++;
}
const extras = b.items.filter((i) => !a.items.find((x) => x.path === i.path));

console.log(`Bucket  : ${BUCKET}`);
console.log(`Source  : ${a.items.length}`);
console.log(`Target  : ${b.items.length}`);
console.log(`Same    : ${same}`);
console.log(`Diff    : ${mismatch}`);
console.log(`Missing : ${missing}`);
console.log(`Extras  : ${extras.length}`);
if (issues.length) {
  console.log("\nIssues:");
  issues.slice(0, 50).forEach((i) => console.log("  " + i));
}
process.exit(missing + mismatch === 0 ? 0 : 2);
