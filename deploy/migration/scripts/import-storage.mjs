#!/usr/bin/env node
// AfraKala — import storage objects به target Supabase self-host
// از manifest استفاده می‌کند. overwrite فقط با --overwrite مجاز است.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.ENV_FILE || resolve(__dirname, "../.env");

function loadEnv(p) {
  if (!existsSync(p)) throw new Error(`env file not found: ${p}`);
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv(ENV_FILE);

const URL_BASE = need("TARGET_SUPABASE_URL");
const KEY = need("TARGET_SERVICE_ROLE_KEY");
const BUCKET = process.env.STORAGE_BUCKET_PAYMENT_RECEIPTS || "payment-receipt-documents";
const SRC_DIR = resolve(__dirname, "..", process.env.STORAGE_EXPORT_DIR || "./storage-export");
const DRY = (process.env.DRY_RUN || "true") !== "false";
const OVERWRITE = process.argv.includes("--overwrite");

function need(k) {
  const v = process.env[k];
  if (!v) { console.error(`[ERROR] missing env: ${k}`); process.exit(1); }
  return v;
}

async function uploadOne(path, buf) {
  const url = `${URL_BASE}/storage/v1/object/${BUCKET}/${encodeURI(path)}`;
  const method = OVERWRITE ? "PUT" : "POST";
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/octet-stream",
      "x-upsert": OVERWRITE ? "true" : "false",
    },
    body: buf,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
}

(async () => {
  const manifestPath = join(SRC_DIR, "storage-manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`[ERROR] manifest not found: ${manifestPath}`); process.exit(1);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  console.log(`Bucket   : ${BUCKET}`);
  console.log(`Source   : ${SRC_DIR}`);
  console.log(`Items    : ${manifest.items.length}`);
  console.log(`Overwrite: ${OVERWRITE}`);
  console.log(`DRY_RUN  : ${DRY}`);

  if (DRY) {
    manifest.items.slice(0, 20).forEach(i => console.log(`  - ${i.path} (${i.size}b)`));
    console.log("[DRY_RUN] چیزی آپلود نشد.");
    return;
  }

  const targetManifest = [];
  let ok = 0, fail = 0;
  for (const it of manifest.items) {
    const fp = join(SRC_DIR, BUCKET, it.path);
    const buf = await readFile(fp);
    const sha = createHash("sha256").update(buf).digest("hex");
    if (sha !== it.sha256) {
      console.warn(`[WARN] sha mismatch local file: ${it.path}`); fail++; continue;
    }
    try { await uploadOne(it.path, buf); targetManifest.push({ ...it }); ok++; process.stdout.write("."); }
    catch (e) { console.warn(`\n[FAIL] ${it.path}: ${e.message}`); fail++; }
  }
  await readFile; // noop
  const out = join(SRC_DIR, "storage-manifest.target.json");
  await (await import("node:fs/promises")).writeFile(out,
    JSON.stringify({ bucket: BUCKET, count: targetManifest.length, items: targetManifest }, null, 2));
  console.log(`\n[DONE] uploaded=${ok} failed=${fail} → manifest: ${out}`);
})().catch(e => { console.error("[ERROR]", e.message); process.exit(1); });