// Empirical map of what the `viewer` role can actually read over PostgREST.
// Reading 400 policies is guesswork; asking the API is not.
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const env = Object.fromEntries(
  fs.readFileSync("deploy/lan/.env.lan", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).replace(/^﻿/, ""), l.slice(i + 1)]; }),
);

const q = (sql) => execFileSync("docker",
  ["exec", "afrakala-lan-db", "psql", "-U", "postgres", "-d", "afrakala", "-A", "-t", "-c", sql],
  { encoding: "utf8" }).trim().split("\n").filter(Boolean);

const mint = (sub) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ sub, role: "authenticated", aud: "authenticated", iat: now, exp: now + 1800 });
  const sig = crypto.createHmac("sha256", env.JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
};

// Must be a *viewer-only* account. The first row of `where role='viewer'` is the owner's
// account, which also holds admin/manager/sales/accountant — probing with it measures
// nothing. This server has 14 admins; picking "any viewer" is exactly the trap rule 2.9 warns
// about.
const VIEWER = q(`select ur.user_id from user_roles ur
                   where ur.role='viewer'
                     and not exists (select 1 from user_roles o
                                      where o.user_id=ur.user_id and o.role<>'viewer')
                   limit 1`)[0];
const SALES = q("select user_id from user_roles where role='sales' order by user_id limit 1")[0];
const base = `http://192.168.170.8:${env.SUPABASE_API_PORT}/rest/v1`;

const tables = q(`
  select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','v','m')
   order by c.relname`);

async function probe(jwt, table) {
  const res = await fetch(`${base}/${table}?select=*&limit=1`, {
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${jwt}`, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = res.headers.get("content-range") || "";
  const total = cr.includes("/") ? cr.split("/")[1] : "?";
  return { status: res.status, total };
}

const vj = mint(VIEWER), sj = mint(SALES);
const out = [];
for (const t of tables) {
  const v = await probe(vj, t);
  out.push({ table: t, viewer_status: v.status, viewer_rows: v.total });
}
const readable = out.filter((r) => r.viewer_status === 200 && r.viewer_rows !== "0" && r.viewer_rows !== "*");
console.log(`tables probed: ${out.length}`);
console.log(`viewer can read rows from: ${readable.length}`);
for (const r of readable) console.log(`  ${r.table}\t${r.viewer_rows}`);
fs.writeFileSync("docs/verification/asan/viewer-probe-after.json",
  JSON.stringify({ viewer: VIEWER, sales: SALES, results: out }, null, 1));
