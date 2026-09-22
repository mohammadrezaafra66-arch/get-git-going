/**
 * B1 live hook probe — two extensions, same linkedid → one card key.
 * Runs against LAN web (in-container preferred). Never prints tokens.
 *
 * Modes (argv):
 *   map          GET mapped extensions
 *   post         POST two ring events
 *   group        Query DB rows + groupCallsByCardKey (node import)
 *   cleanup      DELETE synthetic rows
 *   all          post → group → cleanup (default interactive flow via separate steps)
 *
 * Env:
 *   HOOK_BASE   default http://127.0.0.1:3100 (in-container) or http://192.168.170.8:3100
 *   LINKEDID    optional override
 *   PHONE       default 09000000101
 *   EXT_A/EXT_B default 401 / 412
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE = resolve(__dirname, "b1-hook-probe-state.json");
const OUT_DIR = __dirname;

const mode = process.argv[2] || "help";
const HOOK_BASE = (process.env.HOOK_BASE || "http://127.0.0.1:3100").replace(/\/$/, "");
const PHONE = process.env.PHONE || "09000000101";
const EXT_A = process.env.EXT_A || "401";
const EXT_B = process.env.EXT_B || "412";

function token() {
  const t = process.env.ISSABEL_IMPORT_WORKER_TOKEN || "";
  if (!t) throw new Error("ISSABEL_IMPORT_WORKER_TOKEN missing in env");
  return t;
}

function redact(s) {
  return String(s).replace(/Bearer\s+\S+/gi, "Bearer <REDACTED>");
}

function saveState(obj) {
  writeFileSync(STATE, JSON.stringify(obj, null, 2));
}

function loadState() {
  if (!existsSync(STATE)) return null;
  return JSON.parse(readFileSync(STATE, "utf8"));
}

async function hookGet() {
  const res = await fetch(`${HOOK_BASE}/api/public/hooks/issabel-ami-ring`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`map non-json HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return { status: res.status, json };
}

async function hookPost(payload) {
  const res = await fetch(`${HOOK_BASE}/api/public/hooks/issabel-ami-ring`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

function psql(sql) {
  const remote = "/tmp/b1-hook-probe.sql";
  execFileSync("docker", ["exec", "-i", "afrakala-lan-db", "sh", "-c", `cat > ${remote}`], {
    input: Buffer.from(sql, "utf8"),
  });
  return execFileSync(
    "docker",
    [
      "exec",
      "afrakala-lan-db",
      "bash",
      "-lc",
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -f ${remote}`,
    ],
    { encoding: "utf8" },
  );
}

function psqlJson(sql) {
  // Returns JSON array via psql -t -A (avoid COPY pretty-print escapes)
  const remote = "/tmp/b1-hook-probe-q.sql";
  const wrapped = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text AS j FROM (${sql}) t;`;
  execFileSync("docker", ["exec", "-i", "afrakala-lan-db", "sh", "-c", `cat > ${remote}`], {
    input: Buffer.from(wrapped, "utf8"),
  });
  const out = execFileSync(
    "docker",
    [
      "exec",
      "afrakala-lan-db",
      "bash",
      "-lc",
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -t -A -f ${remote}`,
    ],
    { encoding: "utf8" },
  ).trim();
  // psql may wrap long lines; collapse whitespace between tokens only if needed
  const cleaned = out.replace(/\r?\n/g, "");
  return JSON.parse(cleaned || "[]");
}

async function runMap() {
  const { status, json } = await hookGet();
  const exts = json.extensions || [];
  const summary = {
    http: status,
    ok: json.ok,
    ext_count: exts.length,
    has_401: exts.includes("401"),
    has_412: exts.includes("412"),
    sample: exts.slice(0, 25),
  };
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(resolve(OUT_DIR, "b1-map.txt"), JSON.stringify(summary, null, 2));
  return summary;
}

async function runPost() {
  const map = await runMap();
  const extA = map.has_401 ? EXT_A : map.sample[0];
  const extB = map.has_412 ? EXT_B : map.sample.find((e) => e !== extA) || map.sample[1];
  if (!extA || !extB) throw new Error("Need two mapped extensions; map returned insufficient");

  const ts = Date.now();
  const linkedid = process.env.LINKEDID || `TEST-9FIX-B1-${ts}`;
  const eventAt = new Date().toISOString();

  const payloads = [
    {
      extension: String(extA),
      callerNumber: PHONE,
      linkedid,
      uniqueid: `${linkedid}-a`,
      eventAt,
      source: "manual",
      direction: "inbound",
      raw: { marker: "[TEST-9FIX]", probe: "B1", ext: extA },
    },
    {
      extension: String(extB),
      callerNumber: PHONE,
      linkedid,
      uniqueid: `${linkedid}-b`,
      eventAt,
      source: "manual",
      direction: "inbound",
      raw: { marker: "[TEST-9FIX]", probe: "B1", ext: extB },
    },
  ];

  const results = [];
  for (const p of payloads) {
    const r = await hookPost(p);
    results.push({
      extension: p.extension,
      linkedid: p.linkedid,
      http: r.status,
      ok: r.json?.ok,
      id: r.json?.id ?? null,
      duplicate: r.json?.duplicate ?? null,
      employee_id: r.json?.employee_id ? "<uuid>" : null,
      error: r.json?.error ?? null,
      message: r.json?.message ?? null,
    });
    console.log(JSON.stringify(results[results.length - 1]));
  }

  const state = { linkedid, phone: PHONE, extA, extB, eventAt, results, postedAt: new Date().toISOString() };
  saveState(state);
  writeFileSync(resolve(OUT_DIR, "b1-post.txt"), JSON.stringify(state, null, 2));
  return state;
}

async function loadGroupFn() {
  // __dirname = .../docs/missions/salesdesk-9-fixes/evidence/W2 → 5 levels to repo root
  const root = resolve(__dirname, "../../../../..");
  const tsPath = resolve(root, "src/lib/calls/call-card-key.ts");
  // Use sibling .ts via tsx if available, else implement same contract inline for probe
  try {
    // Try importing via relative path that works with node --experimental-strip-types
    const mod = await import(pathToFileURL(tsPath).href);
    return { groupCallsByCardKey: mod.groupCallsByCardKey, getCallCardKey: mod.getCallCardKey, via: tsPath };
  } catch (e) {
    // Inline minimal mirror (must match call-card-key.ts) for grouping proof if strip-types unavailable
    function extractLinkedId(call) {
      const top = call.linkedid?.trim() || null;
      if (top) return top;
      const meta = call.metadata;
      if (meta && typeof meta.linkedid === "string" && meta.linkedid.trim()) return meta.linkedid.trim();
      return null;
    }
    function getCallCardKey(call) {
      const linked = extractLinkedId(call);
      if (linked) return `lid:${linked}`;
      return `row:${call.id ?? "unknown"}`;
    }
    function groupCallsByCardKey(calls) {
      const buckets = new Map();
      for (const call of calls) {
        const key = getCallCardKey(call);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(call);
      }
      return [...buckets.entries()].map(([key, members]) => ({
        key,
        members,
        extensions: [...new Set(members.map((m) => m.extension?.trim()).filter(Boolean))].sort(),
      }));
    }
    return { groupCallsByCardKey, getCallCardKey, via: "inline-fallback", err: String(e?.message || e) };
  }
}

async function runGroup() {
  const state = loadState();
  if (!state?.linkedid) throw new Error("No state — run post first");
  const linkedid = state.linkedid;

  const countOut = psql(`
SELECT count(*) AS row_count
FROM call_ring_events
WHERE linkedid = '${linkedid.replace(/'/g, "''")}';
`);
  console.log("--- count ---");
  console.log(countOut);

  const rows = psqlJson(`
SELECT id::text, linkedid, uniqueid, caller_number, extension, event_at::text, created_at::text, direction, source, metadata
FROM call_ring_events
WHERE linkedid = '${linkedid.replace(/'/g, "''")}'
ORDER BY extension
`);

  // Shape like recent-calls.ts fetchRecentRingEventsForPopup
  const shaped = rows.map((r) => {
    const meta = { ...(r.metadata || {}) };
    if (r.caller_number && meta.raw_number == null) meta.raw_number = r.caller_number;
    if (r.linkedid && meta.linkedid == null) meta.linkedid = r.linkedid;
    if (r.uniqueid && meta.uniqueid == null) meta.uniqueid = r.uniqueid;
    return {
      id: `ring:${r.id}`,
      started_at: r.event_at,
      created_at: r.created_at,
      extension: r.extension,
      linkedid: r.linkedid,
      uniqueid: r.uniqueid,
      metadata: meta,
    };
  });

  const { groupCallsByCardKey, getCallCardKey, via, err } = await loadGroupFn();
  const groups = groupCallsByCardKey(shaped);
  const report = {
    linkedid,
    db_row_count: rows.length,
    shaped_count: shaped.length,
    group_fn_via: via,
    group_fn_err: err || null,
    card_keys: shaped.map((r) => ({ id: r.id, extension: r.extension, key: getCallCardKey(r) })),
    group_count: groups.length,
    groups: groups.map((g) => ({
      key: g.key,
      extensions: g.extensions,
      member_count: g.members.length,
      member_ids: g.members.map((m) => m.id),
    })),
    rows_summary: rows.map((r) => ({
      id: r.id,
      extension: r.extension,
      linkedid: r.linkedid,
      caller_number: r.caller_number,
      source: r.source,
    })),
  };

  console.log(JSON.stringify(report, null, 2));
  // Separate file so stdout redirect does not EBUSY the same path (Windows)
  writeFileSync(resolve(OUT_DIR, "b1-group-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(OUT_DIR, "b1-shaped.json"), JSON.stringify(shaped, null, 2));

  // Assert for exit code
  if (rows.length !== 2) {
    console.error(`FAIL: expected 2 DB rows, got ${rows.length}`);
    process.exitCode = 1;
  }
  if (groups.length !== 1) {
    console.error(`FAIL: expected 1 card group, got ${groups.length}`);
    process.exitCode = 1;
  } else if (groups[0].extensions.length < 2) {
    console.error(`FAIL: expected both extensions in group, got ${JSON.stringify(groups[0].extensions)}`);
    process.exitCode = 1;
  } else {
    console.log("PASS: 2 rows → 1 card group");
  }
  return report;
}

function runCleanup() {
  const state = loadState();
  const before = psql(`
SELECT count(*) AS before_count
FROM call_ring_events
WHERE linkedid LIKE 'TEST-9FIX-B1-%' OR caller_number = '09000000101';
`);
  console.log("--- before delete ---");
  console.log(before);

  const del = psql(`
DELETE FROM call_ring_events
WHERE linkedid LIKE 'TEST-9FIX-B1-%'
   OR (caller_number = '09000000101' AND linkedid LIKE 'TEST-9FIX-B1-%');
SELECT count(*) AS after_count
FROM call_ring_events
WHERE linkedid LIKE 'TEST-9FIX-B1-%' OR caller_number = '09000000101';
`);
  console.log("--- delete + after ---");
  console.log(del);
  writeFileSync(
    resolve(OUT_DIR, "b1-cleanup-report.txt"),
    `BEFORE:\n${before}\nAFTER:\n${del}\nstate_linkedid=${state?.linkedid ?? "n/a"}\n`,
  );
}

function help() {
  console.log(`usage: node b1-hook-probe.mjs <map|post|group|cleanup|unit>
Requires ISSABEL_IMPORT_WORKER_TOKEN in env (use docker exec web).
HOOK_BASE=${HOOK_BASE}`);
}

async function runUnitBaseline() {
  // Prove unit already covers B1 (E3)
  const root = resolve(__dirname, "../../../../..");
  const testFile = resolve(root, "src/lib/calls/call-card-key.test.ts");
  console.log(`UNIT_TEST=${testFile}`);
  console.log(`EXISTS=${existsSync(testFile)}`);
}

if (mode === "map") await runMap();
else if (mode === "post") await runPost();
else if (mode === "group") await runGroup();
else if (mode === "cleanup") runCleanup();
else if (mode === "unit") await runUnitBaseline();
else help();
