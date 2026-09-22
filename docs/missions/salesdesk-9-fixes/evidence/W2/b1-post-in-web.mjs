/**
 * In-container B1 POST — uses fetch; never prints token.
 * docker cp to /tmp/b1-post-in-web.mjs && docker exec afrakala-lan-web node /tmp/b1-post-in-web.mjs
 */
import { writeFileSync } from "node:fs";

const BASE = (process.env.HOOK_BASE || "http://127.0.0.1:3100").replace(/\/$/, "");
const PHONE = process.env.PHONE || "09000000101";
const EXT_A = process.env.EXT_A || "401";
const EXT_B = process.env.EXT_B || "412";
const token = process.env.ISSABEL_IMPORT_WORKER_TOKEN || "";
const ts = Date.now();
const linkedid = process.env.LINKEDID || `TEST-9FIX-B1-${ts}`;
const eventAt = new Date().toISOString();

if (!token) {
  console.error("ERR=token_missing");
  process.exit(2);
}

console.log(
  JSON.stringify({
    TOKEN_SET: true,
    TOKEN_LEN: token.length,
    LINKEDID: linkedid,
    EXT_A,
    EXT_B,
    PHONE,
    BASE,
  }),
);

async function getMap() {
  const res = await fetch(`${BASE}/api/public/hooks/issabel-ami-ring`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  const e = json.extensions || [];
  console.log(
    JSON.stringify({
      MAP_HTTP: res.status,
      ok: json.ok,
      ext_count: e.length,
      has_401: e.includes("401"),
      has_412: e.includes("412"),
      sample: e.slice(0, 20),
    }),
  );
  return e;
}

async function postOne(extension, uniqueid) {
  const body = {
    extension,
    callerNumber: PHONE,
    linkedid,
    uniqueid,
    eventAt,
    source: "manual",
    direction: "inbound",
    raw: { marker: "[TEST-9FIX]", probe: "B1", ext: extension },
  };
  const res = await fetch(`${BASE}/api/public/hooks/issabel-ami-ring`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  console.log(
    JSON.stringify({
      extension,
      http: res.status,
      ok: json.ok ?? null,
      id: json.id ?? null,
      duplicate: !!json.duplicate,
      employee_present: !!json.employee_id,
      error: json.error ?? null,
      message: json.message ?? null,
    }),
  );
  return { http: res.status, json };
}

const exts = await getMap();
const extA = exts.includes("401") ? EXT_A : exts[0];
const extB = exts.includes("412") ? EXT_B : exts.find((x) => x !== extA) || exts[1];
if (!extA || !extB) {
  console.error("ERR=need_two_mapped_extensions");
  process.exit(3);
}

const r1 = await postOne(String(extA), `${linkedid}-a`);
const r2 = await postOne(String(extB), `${linkedid}-b`);

writeFileSync(
  "/tmp/b1-linkedid.txt",
  linkedid + "\n",
);
writeFileSync(
  "/tmp/b1-post-result.json",
  JSON.stringify(
    {
      linkedid,
      phone: PHONE,
      extA,
      extB,
      eventAt,
      results: [
        { extension: extA, http: r1.http, ok: r1.json?.ok, id: r1.json?.id, duplicate: r1.json?.duplicate },
        { extension: extB, http: r2.http, ok: r2.json?.ok, id: r2.json?.id, duplicate: r2.json?.duplicate },
      ],
    },
    null,
    2,
  ),
);
console.log("WROTE=/tmp/b1-linkedid.txt");
