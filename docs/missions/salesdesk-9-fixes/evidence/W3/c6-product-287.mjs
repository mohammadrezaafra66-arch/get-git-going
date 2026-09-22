/**
 * C6 probe: searchDealProducts("287") should find a product whose sku/name includes X287.
 * Run: npx --yes tsx docs/missions/salesdesk-9-fixes/evidence/W3/c6-product-287.mjs
 *
 * Needs LAN env + anon/authenticated supabase — if credentials missing, exits 2 with note.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath =
  process.env.AFRAKALA_LAN_ENV ||
  resolve("D:/AfraKalaTest/app/deploy/lan/.env.lan");
const envText = readFileSync(envPath, "utf8");
const get = (k) => {
  const m = envText.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};

const url = get("VITE_SUPABASE_URL") || get("SUPABASE_URL");
const key =
  get("SUPABASE_SERVICE_ROLE_KEY") ||
  get("SERVICE_ROLE_KEY") ||
  get("VITE_SUPABASE_ANON_KEY") ||
  get("SUPABASE_ANON_KEY") ||
  get("ANON_KEY");

const outPath = resolve(
  "docs/missions/salesdesk-9-fixes/evidence/W3/c6-product-287.txt",
);

if (!url || !key) {
  const msg = "MISSING_CREDS url/key empty";
  writeFileSync(outPath, msg + "\n", "utf8");
  console.error(msg);
  process.exit(2);
}

const sb = createClient(url, key);
const { data, error } = await sb.rpc("search_product_ids", {
  p_term: "287",
  p_limit: 20,
});

if (error) {
  writeFileSync(outPath, `RPC_ERROR ${error.message}\n`, "utf8");
  console.error(error.message);
  process.exit(1);
}

const rows = data ?? [];
const hit = rows.find(
  (r) =>
    String(r.sku ?? "").toUpperCase().includes("X287") ||
    String(r.name ?? "").toUpperCase().includes("X287"),
);

const report = {
  term: "287",
  count: rows.length,
  found_x287: !!hit,
  hit: hit
    ? { id: hit.id, name: hit.name, sku: hit.sku, stock_status: hit.stock_status }
    : null,
  sample: rows.slice(0, 5).map((r) => ({ sku: r.sku, name: r.name })),
};

writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
process.exit(hit ? 0 : 1);
