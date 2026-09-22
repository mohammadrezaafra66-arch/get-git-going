/**
 * In-container F2 AMI ring POST — never prints token.
 * Usage:
 *   docker cp …/f2-post-ring.mjs afrakala-lan-web:/tmp/f2-post-ring.mjs
 *   docker exec -e HOOK_BASE=http://127.0.0.1:3000 -e PHONE=… -e EXT=… -e LINKEDID=… \
 *     afrakala-lan-web node /tmp/f2-post-ring.mjs
 */
const BASE = (process.env.HOOK_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const PHONE = process.env.PHONE || "09000000120";
const EXT = process.env.EXT || "";
const token = process.env.ISSABEL_IMPORT_WORKER_TOKEN || "";
const linkedid =
  process.env.LINKEDID || `TEST9FIX-F2-${Date.now()}`;
const eventAt = new Date().toISOString();
const PROBE = process.env.PROBE || "F2";

if (!token) {
  console.error("ERR=token_missing");
  process.exit(2);
}

console.log(
  JSON.stringify({
    TOKEN_SET: true,
    TOKEN_LEN: token.length,
    LINKEDID: linkedid,
    EXT_REQ: EXT || null,
    PHONE,
    BASE,
    PROBE,
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
      sample: e.slice(0, 20),
    }),
  );
  return e.map(String);
}

const exts = await getMap();
const extension = EXT && exts.includes(String(EXT)) ? String(EXT) : exts[0];
if (!extension) {
  console.error("ERR=no_mapped_extension");
  process.exit(3);
}

const body = {
  extension,
  callerNumber: PHONE,
  linkedid,
  uniqueid: `${linkedid}-u`,
  eventAt,
  source: "manual",
  direction: "inbound",
  raw: { marker: "[TEST-9FIX]", probe: PROBE, ext: extension },
};

const res = await fetch(`${BASE}/api/public/hooks/issabel-ami-ring`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

let json = {};
try {
  json = await res.json();
} catch {
  json = {};
}

console.log(
  JSON.stringify({
    extension,
    linkedid,
    phone: PHONE,
    http: res.status,
    ok: json.ok ?? null,
    id: json.id ?? null,
    duplicate: !!json.duplicate,
    employee_present: !!json.employee_id,
    error: json.error ?? null,
    message: json.message ?? null,
  }),
);

if (res.status !== 200 || !json.ok) {
  process.exit(4);
}
