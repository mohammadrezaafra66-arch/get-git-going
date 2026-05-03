#!/usr/bin/env node
// AfraKala — export storage objects از source Supabase
// فقط Node.js >= 20 و fetch داخلی. بدون وابستگی خارجی.
// secret هرگز log نمی‌شود.

import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.ENV_FILE || resolve(__dirname, "../.env");

function loadEnv(p) {
  if (!existsSync(p)) throw new Error(`env file not found: ${p}`);
  const txt = require("node:fs").readFileSync(p, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
// dynamic require for ESM
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
loadEnv(ENV_FILE);

const URL_BASE = need("SOURCE_SUPABASE_URL");
const KEY = need("SOURCE_SERVICE_ROLE_KEY");
const BUCKET = process.env.STORAGE_BUCKET_PAYMENT_RECEIPTS || "payment-receipt-documents";
const OUT_DIR = resolve(__dirname, "..", process.env.STORAGE_EXPORT_DIR || "./storage-export");
const DRY = (process.env.DRY_RUN || "true") !== "false";
const PAGE = 100;
const MAX_RETRY = 3;

function need(k) {
  const v = process.env[k];
  if (!v) { console.error(`[ERROR] missing env: ${k}`); process.exit(1); }
  return v;
}

async function listAll(prefix = "") {
  const out = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    const items = await res.json();
    if (!items.length) break;
    for (const it of items) {
      if (it.id === null && it.metadata === null) {
        // folder — recurse
        const sub = prefix ? `${prefix}/${it.name}` : it.name;
        out.push(...await listAll(sub));
      } else {
        out.push({ path: prefix ? `${prefix}/${it.name}` : it.name, size: it.metadata?.size ?? 0 });
      }
    }
    if (items.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function downloadOne(path) {
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
        headers: { Authorization: `Bearer ${KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i === MAX_RETRY - 1) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

(async () => {
  console.log(`Bucket : ${BUCKET}`);
  console.log(`Output : ${OUT_DIR}`);
  console.log(`DRY_RUN: ${DRY}`);
  const items = await listAll("");
  console.log(`Found  : ${items.length} object(s)`);

  if (DRY) {
    items.slice(0, 20).forEach(i => console.log(`  - ${i.path} (${i.size}b)`));
    if (items.length > 20) console.log(`  ... +${items.length - 20} more`);
    console.log("[DRY_RUN] هیچ فایلی دانلود نشد.");
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const manifest = [];
  for (const it of items) {
    const buf = await downloadOne(it.path);
    const dest = join(OUT_DIR, BUCKET, it.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    const sha = createHash("sha256").update(buf).digest("hex");
    manifest.push({ path: it.path, size: buf.length, sha256: sha });
    process.stdout.write(`.`);
  }
  await writeFile(join(OUT_DIR, "storage-manifest.json"),
    JSON.stringify({ bucket: BUCKET, count: manifest.length, items: manifest }, null, 2));
  console.log(`\n[OK] exported ${manifest.length} files + manifest.`);
})().catch(e => { console.error("[ERROR]", e.message); process.exit(1); });